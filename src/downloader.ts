import { createWriteStream } from "node:fs";
import { mkdir, rename, stat } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { errorMessage, logger } from "./logger.js";

const MAX_ATTEMPTS = 5;

export interface DownloadOptions {
  url: string;
  dest: string;
  signal: AbortSignal;
  onProgress: (bytes: number) => void;
}

/**
 * Télécharge `url` (HTTPS uniquement) vers `dest` en passant par un fichier `.part`,
 * avec reprise là où le téléchargement s'était arrêté en cas d'erreur ou de redémarrage.
 */
export async function downloadFile({ url, dest, signal, onProgress }: DownloadOptions): Promise<void> {
  if (new URL(url).protocol !== "https:") throw new Error("Lien de téléchargement non HTTPS refusé");

  const part = `${dest}.part`;
  const existing = await fileSize(dest);
  if (existing !== undefined && (await fileSize(part)) === undefined) {
    onProgress(existing);
    return;
  }
  await mkdir(path.dirname(dest), { recursive: true });

  for (let attempt = 1; ; attempt++) {
    try {
      await attemptDownload(url, part, signal, onProgress);
      break;
    } catch (err) {
      if (signal.aborted || attempt >= MAX_ATTEMPTS) throw err;
      logger.warn(
        `Téléchargement de ${path.basename(dest)} interrompu (tentative ${attempt}/${MAX_ATTEMPTS}) : ${errorMessage(err)}`,
      );
      await sleep(attempt * 5000, undefined, { signal });
    }
  }
  await rename(part, dest);
}

async function attemptDownload(
  url: string,
  part: string,
  signal: AbortSignal,
  onProgress: (bytes: number) => void,
): Promise<void> {
  let offset = (await fileSize(part)) ?? 0;
  const response = await fetch(url, { headers: offset > 0 ? { range: `bytes=${offset}-` } : {}, signal });

  if (response.status === 416 && offset > 0) {
    // Le serveur n'a plus rien à envoyer : le fichier .part est déjà complet.
    await response.body?.cancel();
    onProgress(offset);
    return;
  }
  if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
  if (response.status !== 206) offset = 0; // reprise non prise en charge : on repart de zéro

  const length = Number(response.headers.get("content-length") ?? Number.NaN);
  const expected = Number.isFinite(length) ? offset + length : undefined;
  let written = offset;
  onProgress(written);

  const counter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      written += chunk.length;
      onProgress(written);
      callback(null, chunk);
    },
  });
  await pipeline(
    Readable.fromWeb(response.body),
    counter,
    createWriteStream(part, { flags: offset > 0 ? "a" : "w" }),
    { signal },
  );
  if (expected !== undefined && written !== expected) {
    throw new Error(`fichier incomplet (${written}/${expected} octets)`);
  }
}

async function fileSize(file: string): Promise<number | undefined> {
  try {
    return (await stat(file)).size;
  } catch {
    return undefined;
  }
}
