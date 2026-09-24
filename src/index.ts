import path from "node:path";
import { AllDebridClient, AllDebridError } from "./alldebrid.js";
import { config } from "./config.js";
import { errorMessage, logger } from "./logger.js";
import { DownloadManager } from "./manager.js";
import { createQbitServer } from "./qbittorrent.js";
import { JobStore } from "./store.js";

// Pas de process.exit() : sous Windows il peut faire planter Node pendant la fermeture
// des connexions HTTPS. On positionne exitCode et on laisse le processus se terminer.

async function main(): Promise<void> {
  const store = new JobStore(path.join(config.dataDir, "state.json"));
  await store.load();

  const debrid = new AllDebridClient(config.alldebrid.apiKey, config.alldebrid.agent);
  try {
    const user = await debrid.getUser();
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

  const manager = new DownloadManager(store, debrid);
  const server = createQbitServer(manager, store);

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
    logger.info(`API compatible qBittorrent sur http://${config.server.host}:${config.server.port}`);
    logger.info(`Téléchargements dans ${config.downloadDir}`);
    manager.start();
  });
}

await main();
