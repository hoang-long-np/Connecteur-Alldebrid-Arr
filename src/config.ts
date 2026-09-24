import path from "node:path";

try {
  process.loadEnvFile();
} catch {
  // Le fichier .env est facultatif : les variables peuvent venir de l'environnement.
}

function env(name: string, fallback?: string): string {
  const value = process.env[name]?.trim();
  if (value) return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`Variable d'environnement manquante : ${name} (voir .env.example)`);
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} doit être un entier positif`);
  return value;
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  return ["1", "true", "yes", "oui"].includes(raw);
}

const downloadDir = path.resolve(env("DOWNLOAD_DIR", "downloads"));

export const config = {
  alldebrid: {
    apiKey: env("ALLDEBRID_API_KEY"),
    agent: env("ALLDEBRID_AGENT", "Connecteur-Alldebrid-Arr"),
    cleanup: envBool("ALLDEBRID_CLEANUP", true),
  },
  server: {
    host: env("HOST", "0.0.0.0"),
    port: envInt("PORT", 8090),
    username: env("QBIT_USERNAME", "admin"),
    password: process.env.QBIT_PASSWORD?.trim() ?? "",
  },
  downloadDir,
  // Par défaut, l'état est rangé dans le dossier de téléchargement (déjà accessible en écriture).
  dataDir: path.resolve(env("DATA_DIR", path.join(downloadDir, ".alldebrid-arr"))),
  maxConcurrentDownloads: envInt("MAX_CONCURRENT_DOWNLOADS", 3),
  pollIntervalMs: envInt("POLL_INTERVAL_SECONDS", 5) * 1000,
  logLevel: env("LOG_LEVEL", "info"),
};
