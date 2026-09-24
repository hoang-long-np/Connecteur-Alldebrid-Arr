import { constants } from "node:fs";
import { access, mkdir } from "node:fs/promises";
import path from "node:path";
import { AllDebridClient, AllDebridError } from "./alldebrid.js";
import { config } from "./config.js";
import { AccountMonitor } from "./dashboard.js";
import { errorMessage, logger } from "./logger.js";
import { DownloadManager } from "./manager.js";
import { createQbitServer } from "./qbittorrent.js";
import { JobStore } from "./store.js";

// Pas de process.exit() : sous Windows il peut faire planter Node pendant la fermeture
// des connexions HTTPS. On positionne exitCode et on laisse le processus se terminer.

const ACCOUNT_REFRESH_MS = 24 * 60 * 60 * 1000;

async function isWritable(dir: string, label: string): Promise<boolean> {
  try {
    await mkdir(dir, { recursive: true });
    await access(dir, constants.W_OK);
    return true;
  } catch (err) {
    const user = process.getuid ? ` pour l'utilisateur ${process.getuid()}:${process.getgid?.()}` : "";
    logger.error(`${label} inaccessible en écriture${user} : ${dir} (${errorMessage(err)})`);
    return false;
  }
}

async function main(): Promise<void> {
  logger.info(`Téléchargements : ${config.downloadDir} — état : ${config.dataDir}`);
  const writable = [
    await isWritable(config.downloadDir, "Dossier de téléchargement"),
    await isWritable(config.dataDir, "Dossier d'état"),
  ];
  if (writable.includes(false)) {
    process.exitCode = 1;
    return;
  }

  const store = new JobStore(path.join(config.dataDir, "state.json"));
  await store.load();

  const debrid = new AllDebridClient(config.alldebrid.apiKey, config.alldebrid.agent);
  const account = new AccountMonitor(debrid);

  try {
    await account.refresh();
    const user = account.state.info!;
    if (user.isPremium) logger.info(`Connecté à AllDebrid : ${user.username} (premium)`);
    else logger.warn(`Le compte AllDebrid ${user.username} n'est pas premium : les téléchargements risquent d'échouer`);
  } catch (err) {
    if (err instanceof AllDebridError && err.code.startsWith("AUTH_")) {
      logger.error(`Clé API AllDebrid refusée : ${err.message}`);
      process.exitCode = 1;
      return;
    }
    logger.warn(`AllDebrid injoignable pour le moment : ${errorMessage(err)}`);
  }
  // Statut du compte (premium, date d'expiration) affiché dans l'interface web.
  setInterval(() => {
    account.refresh().catch((err) => logger.warn(`Compte AllDebrid injoignable : ${errorMessage(err)}`));
  }, ACCOUNT_REFRESH_MS).unref();

  const manager = new DownloadManager(store, debrid);
  const server = createQbitServer(manager, store, account);

  let stopping = false;
  const shutdown = async (): Promise<void> => {
    if (stopping) return;
    stopping = true;
    logger.info("Arrêt en cours…");
    server.close();
    server.closeAllConnections();
    await manager.stop();
    await store.flush();
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());

  server.on("error", (err) => {
    logger.error(`Serveur HTTP : ${errorMessage(err)}`);
    process.exitCode = 1;
    void shutdown();
  });
  server.listen(config.server.port, config.server.host, () => {
    logger.info(`API compatible qBittorrent et interface web sur http://${config.server.host}:${config.server.port}`);
    manager.start();
  });
}

await main();
