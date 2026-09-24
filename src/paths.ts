import path from "node:path";
import { config } from "./config.js";
import type { FileTask, Job } from "./store.js";

const INVALID_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g;
const RESERVED_NAMES = /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i;

/** Rend un nom de fichier sûr sous Windows comme sous Linux (et empêche de sortir du dossier). */
export function sanitize(segment: string): string {
  const clean = segment.replace(INVALID_CHARS, "_").trim().replace(/[. ]+$/, "");
  if (!clean) return "_";
  return RESERVED_NAMES.test(clean) ? `_${clean}` : clean;
}

export function categorySavePath(category: string): string {
  return category ? path.join(config.downloadDir, sanitize(category)) : config.downloadDir;
}

function hasSingleRoot(job: Job): boolean {
  return job.files.length > 0 && new Set(job.files.map((file) => file.path[0])).size === 1;
}

/**
 * Chemin d'un fichier relatif à save_path, comme qBittorrent en mode « Original » :
 * le dossier racine du torrent est conservé, et on en crée un s'il n'y en a pas.
 */
export function relativeSegments(job: Job, file: FileTask): string[] {
  const segments = file.path.map(sanitize);
  return hasSingleRoot(job) ? segments : [sanitize(job.name), ...segments];
}

export function filePath(job: Job, file: FileTask): string {
  return path.join(job.savePath, ...relativeSegments(job, file));
}

/** Dossier (ou fichier unique) que Radarr/Sonarr doivent importer. */
export function contentPath(job: Job): string {
  const root = hasSingleRoot(job) ? job.files[0].path[0] : job.name;
  return path.join(job.savePath, sanitize(root));
}
