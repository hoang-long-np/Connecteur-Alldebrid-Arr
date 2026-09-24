import { rm } from "node:fs/promises";
import path from "node:path";
import { AllDebridError, MAGNET_FIRST_ERROR, MAGNET_READY, type AllDebridClient, type UploadedMagnet } from "./alldebrid.js";
import { config } from "./config.js";
import { downloadFile } from "./downloader.js";
import { errorMessage, formatBytes, logger } from "./logger.js";
import { categorySavePath, contentPath, filePath } from "./paths.js";
import type { FileTask, Job, JobStore } from "./store.js";
import { parseMagnet, parseTorrentFile } from "./torrent.js";

interface ActiveDownload {
  controller: AbortController;
  done: Promise<void>;
}

export function downloadedBytes(job: Job): number {
  return job.files.reduce((sum, file) => sum + (file.done ? file.size : Math.min(file.downloaded, file.size)), 0);
}

export function ratio(part: number, total: number): number {
  return total > 0 ? Math.min(1, part / total) : 0;
}

/** Progression de 0 à 1 : celle d'AllDebrid tant que les fichiers ne sont pas connus, puis celle du téléchargement. */
export function jobProgress(job: Job): number {
  if (job.phase === "completed") return 1;
  if (job.files.length > 0) return ratio(downloadedBytes(job), job.size);
  return job.debridProgress;
}

export function fileProgress(file: FileTask): number {
  return file.done ? 1 : ratio(file.downloaded, file.size);
}

/**
 * Cycle de vie d'un téléchargement :
 * magnet envoyé à AllDebrid → attente qu'AllDebrid l'ait récupéré → téléchargement HTTPS des fichiers.
 */
export class DownloadManager {
  private readonly active = new Map<string, ActiveDownload>();
  private readonly slots = new Semaphore(config.maxConcurrentDownloads);
  private readonly lastSample = new Map<string, { bytes: number; at: number }>();
  private timer: NodeJS.Timeout | undefined;
  private ticking = false;

  constructor(
    private readonly store: JobStore,
    private readonly debrid: AllDebridClient,
  ) {}

  start(): void {
    this.timer = setInterval(() => void this.tick(), config.pollIntervalMs);
    void this.tick();
  }

  /** Interrompt les téléchargements en cours ; les fichiers .part permettront de reprendre. */
  async stop(): Promise<void> {
    clearInterval(this.timer);
    const downloads = [...this.active.values()];
    for (const { controller } of downloads) controller.abort();
    await Promise.all(downloads.map((download) => download.done));
  }

  addMagnet(uri: string, category: string): Promise<Job> {
    const { hash, name } = parseMagnet(uri);
    return this.add(hash, name, category, () => this.debrid.uploadMagnet(uri));
  }

  addTorrentFile(fileName: string, content: Uint8Array, category: string): Promise<Job> {
    const { hash, name } = parseTorrentFile(content);
    return this.add(hash, name, category, () => this.debrid.uploadTorrentFile(fileName, content));
  }

  async addTorrentUrl(url: string, category: string): Promise<Job> {
    const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status} en récupérant le fichier .torrent`);
    return this.addTorrentFile("release.torrent", new Uint8Array(await response.arrayBuffer()), category);
  }

  async remove(hash: string, deleteFiles: boolean): Promise<void> {
    const job = this.store.get(hash);
    if (!job) return;
    this.store.remove(job.hash);

    const active = this.active.get(job.hash);
    if (active) {
      active.controller.abort();
      await active.done;
    }
    if (config.alldebrid.cleanup) await this.removeFromDebrid(job);
    if (deleteFiles) await this.deleteLocalFiles(job);
    logger.info(`Supprimé : ${job.name}${deleteFiles ? " (fichiers effacés)" : ""}`);
  }

  private async add(
    hash: string,
    fallbackName: string | undefined,
    category: string,
    upload: () => Promise<UploadedMagnet>,
  ): Promise<Job> {
    const existing = this.store.get(hash);
    if (existing && existing.phase !== "error") return existing;
    if (existing) await this.remove(hash, true);

    const magnet = await upload();
    const job: Job = {
      hash,
      name: magnet.name || fallbackName || hash,
      category,
      savePath: categorySavePath(category),
      addedOn: Date.now(),
      debridId: magnet.id,
      debridStatusCode: 0,
      debridProgress: 0,
      phase: "debrid",
      size: magnet.size,
      downloadSpeed: 0,
      files: [],
    };
    this.store.add(job);
    logger.info(
      `Ajouté : ${job.name} [${category || "sans catégorie"}]${magnet.ready ? " — déjà disponible sur AllDebrid" : ""}`,
    );
    void this.tick();
    return job;
  }

  private async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      for (const job of this.store.all()) {
        if (job.phase === "debrid") await this.refreshDebrid(job);
        if (this.store.get(job.hash) !== job) continue; // supprimé entre-temps
        if (job.phase === "downloading" && !this.active.has(job.hash)) this.startDownload(job);
      }
      this.updateSpeeds();
    } catch (err) {
      logger.error(`Erreur inattendue : ${errorMessage(err)}`);
    } finally {
      this.ticking = false;
    }
  }

  private async refreshDebrid(job: Job): Promise<void> {
    try {
      const status = await this.debrid.getMagnetStatus(job.debridId);
      if (status.filename) job.name = status.filename;
      if (status.size) job.size = status.size;
      job.debridStatusCode = status.statusCode;
      job.debridProgress = status.size > 0 ? status.downloaded / status.size : 0;
      job.downloadSpeed = status.downloadSpeed ?? 0;

      if (status.statusCode >= MAGNET_FIRST_ERROR) return this.fail(job, `AllDebrid : ${status.status}`);
      if (status.statusCode === MAGNET_READY) {
        const files = await this.debrid.getMagnetFiles(job.debridId);
        if (files.length === 0) return this.fail(job, "AllDebrid n'a renvoyé aucun fichier");
        job.files = files.map((file) => ({ ...file, downloaded: 0, done: false }));
        job.size = files.reduce((sum, file) => sum + file.size, 0);
        job.debridProgress = 1;
        job.downloadSpeed = 0;
        job.phase = "downloading";
        logger.info(`Prêt sur AllDebrid : ${job.name} (${files.length} fichier(s), ${formatBytes(job.size)})`);
      }
      this.store.save();
    } catch (err) {
      if (err instanceof AllDebridError && err.code.startsWith("MAGNET_")) {
        this.fail(job, `AllDebrid : ${err.message}`);
      } else {
        logger.warn(`Statut AllDebrid indisponible pour ${job.name} : ${errorMessage(err)}`);
      }
    }
  }

  private startDownload(job: Job): void {
    const controller = new AbortController();
    const done = this.downloadJob(job, controller.signal)
      .then(
        () => this.complete(job),
        (err: unknown) => {
          if (!controller.signal.aborted) this.fail(job, errorMessage(err));
        },
      )
      .finally(() => {
        this.active.delete(job.hash);
        this.lastSample.delete(job.hash);
      });
    this.active.set(job.hash, { controller, done });
  }

  private async downloadJob(job: Job, signal: AbortSignal): Promise<void> {
    logger.info(`Téléchargement de ${job.name} vers ${contentPath(job)}`);
    const pending = job.files.filter((file) => !file.done);
    const results = await Promise.allSettled(
      pending.map((file) => this.slots.run(() => this.downloadFile(job, file, signal))),
    );
    const failure = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
    if (failure) throw failure.reason;
  }

  private async downloadFile(job: Job, file: FileTask, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    const url = await this.debrid.unlockLink(file.link, signal);
    await downloadFile({
      url,
      dest: filePath(job, file),
      signal,
      onProgress: (bytes) => {
        file.downloaded = bytes;
      },
    });
    file.done = true;
    this.store.save();
  }

  private complete(job: Job): void {
    if (this.store.get(job.hash) !== job) return;
    job.phase = "completed";
    job.completedOn = Date.now();
    job.downloadSpeed = 0;
    this.store.save();
    logger.info(`Terminé : ${job.name}`);
    if (config.alldebrid.cleanup) void this.removeFromDebrid(job);
  }

  private fail(job: Job, message: string): void {
    job.phase = "error";
    job.error = message;
    job.downloadSpeed = 0;
    this.store.save();
    logger.error(`Échec : ${job.name} — ${message}`);
  }

  private async removeFromDebrid(job: Job): Promise<void> {
    if (job.debridRemoved) return;
    try {
      await this.debrid.deleteMagnet(job.debridId);
      job.debridRemoved = true;
      this.store.save();
    } catch (err) {
      logger.warn(`Impossible de supprimer ${job.name} d'AllDebrid : ${errorMessage(err)}`);
    }
  }

  private async deleteLocalFiles(job: Job): Promise<void> {
    const target = contentPath(job);
    const relative = path.relative(job.savePath, target);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
      logger.warn(`Suppression ignorée, chemin inattendu : ${target}`);
      return;
    }
    await rm(target, { recursive: true, force: true, maxRetries: 3 });
    await rm(`${target}.part`, { force: true, maxRetries: 3 });
  }

  private updateSpeeds(): void {
    const now = Date.now();
    for (const job of this.store.all()) {
      if (job.phase !== "downloading") continue;
      const bytes = downloadedBytes(job);
      const previous = this.lastSample.get(job.hash);
      if (previous && now > previous.at) {
        job.downloadSpeed = Math.max(0, ((bytes - previous.bytes) * 1000) / (now - previous.at));
      }
      this.lastSample.set(job.hash, { bytes, at: now });
    }
  }
}

/** Limite le nombre de fichiers téléchargés en parallèle. */
class Semaphore {
  private available: number;
  private readonly waiters: (() => void)[] = [];

  constructor(size: number) {
    this.available = size;
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.available > 0) this.available--;
    else await new Promise<void>((resolve) => this.waiters.push(resolve));
    try {
      return await task();
    } finally {
      const next = this.waiters.shift();
      if (next) next();
      else this.available++;
    }
  }
}
