import { randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { config } from "./config.js";
import { errorMessage, logger } from "./logger.js";
import { downloadedBytes, type DownloadManager } from "./manager.js";
import { categorySavePath, contentPath, relativeSegments } from "./paths.js";
import type { Job, JobStore } from "./store.js";

// Version annoncée aux *arr : API qBittorrent 2.9 (qBittorrent 4.6).
const APP_VERSION = "v4.6.7";
const API_VERSION = "2.9.3";
const INFINITE_ETA = 8_640_000;
const MAX_BODY_BYTES = 50 * 1024 * 1024;
const MAX_SESSIONS = 100;

interface Params {
  get(name: string): string | null;
  files(name: string): File[];
}

type Handler = (params: Params, res: ServerResponse) => void | Promise<void>;

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Serveur qui imite l'API Web de qBittorrent, pour que Radarr, Sonarr, Lidarr…
 * puissent utiliser le connecteur comme un client torrent classique.
 */
export function createQbitServer(manager: DownloadManager, store: JobStore): Server {
  const sessions = new Set<string>();

  const isAuthorized = (req: IncomingMessage): boolean => {
    if (!config.server.password) return true;
    const sid = /(?:^|;\s*)SID=([^;]+)/.exec(req.headers.cookie ?? "")?.[1];
    return sid !== undefined && sessions.has(sid);
  };

  const login: Handler = (params, res) => {
    const { username, password } = config.server;
    const valid =
      !password || (safeEqual(params.get("username") ?? "", username) && safeEqual(params.get("password") ?? "", password));
    if (!valid) {
      logger.warn("Connexion refusée : identifiants incorrects");
      return send(res, 200, "Fails.");
    }
    const sid = randomBytes(16).toString("hex");
    sessions.add(sid);
    if (sessions.size > MAX_SESSIONS) sessions.delete(sessions.values().next().value!);
    res.setHeader("set-cookie", `SID=${sid}; HttpOnly; Path=/; SameSite=Strict`);
    send(res, 200, "Ok.");
  };

  const selectJobs = (hashes: string | null): Job[] => {
    if (hashes === "all") return store.all();
    const wanted = new Set((hashes ?? "").toLowerCase().split("|").filter(Boolean));
    return store.all().filter((job) => wanted.has(job.hash));
  };

  const findJob = (params: Params): Job => {
    const job = store.get(params.get("hash") ?? "");
    if (!job) throw new HttpError(404, "Torrent hash not found");
    return job;
  };

  const ok: Handler = (_params, res) => send(res, 200, "Ok.");

  const routes: Record<string, Handler> = {
    "/api/v2/auth/logout": ok,
    "/api/v2/app/version": (_params, res) => send(res, 200, APP_VERSION),
    "/api/v2/app/webapiVersion": (_params, res) => send(res, 200, API_VERSION),
    "/api/v2/app/buildInfo": (_params, res) => json(res, { qt: "6.6.1", libtorrent: "2.0.10.0", bitness: 64 }),
    "/api/v2/app/defaultSavePath": (_params, res) => send(res, 200, config.downloadDir),
    "/api/v2/app/setPreferences": ok,
    "/api/v2/app/preferences": (_params, res) =>
      json(res, {
        save_path: config.downloadDir,
        temp_path_enabled: false,
        // Ratio « atteint » dès la fin du téléchargement : autorise Radarr/Sonarr à retirer l'élément.
        max_ratio_enabled: true,
        max_ratio: 0,
        max_ratio_act: 0,
        max_seeding_time_enabled: false,
        max_seeding_time: -1,
        max_inactive_seeding_time_enabled: false,
        max_inactive_seeding_time: -1,
        queueing_enabled: false,
        dht: true,
        auto_tmm_enabled: false,
        torrent_content_layout: "Original",
      }),

    "/api/v2/transfer/info": (_params, res) =>
      json(res, {
        dl_info_speed: Math.round(store.all().reduce((sum, job) => sum + job.downloadSpeed, 0)),
        dl_info_data: 0,
        up_info_speed: 0,
        up_info_data: 0,
        connection_status: "connected",
        dht_nodes: 0,
      }),

    "/api/v2/torrents/categories": (_params, res) => {
      const names = new Set([...store.categories, ...store.all().map((job) => job.category)]);
      names.delete("");
      json(res, Object.fromEntries([...names].map((name) => [name, { name, savePath: categorySavePath(name) }])));
    },
    "/api/v2/torrents/createCategory": (params, res) => {
      const name = params.get("category")?.trim();
      if (!name) throw new HttpError(400, "Catégorie manquante");
      store.addCategory(name);
      send(res, 200, "Ok.");
    },
    "/api/v2/torrents/editCategory": ok,
    "/api/v2/torrents/removeCategories": ok,

    "/api/v2/torrents/info": (params, res) => {
      const category = params.get("category");
      let jobs = params.get("hashes") ? selectJobs(params.get("hashes")) : store.all();
      if (category !== null) jobs = jobs.filter((job) => job.category === category);
      json(res, jobs.map(toTorrent));
    },
    "/api/v2/torrents/properties": (params, res) => {
      const job = findJob(params);
      json(res, {
        hash: job.hash,
        name: job.name,
        save_path: job.savePath,
        total_size: job.size,
        addition_date: seconds(job.addedOn),
        completion_date: job.completedOn ? seconds(job.completedOn) : -1,
        dl_speed: Math.round(job.downloadSpeed),
        share_ratio: job.phase === "completed" ? 1 : 0,
        seeding_time: 0,
      });
    },
    "/api/v2/torrents/files": (params, res) => {
      const job = findJob(params);
      json(
        res,
        job.files.map((file, index) => ({
          index,
          name: relativeSegments(job, file).join("/"),
          size: file.size,
          progress: file.done ? 1 : ratio(file.downloaded, file.size),
          priority: 1,
          is_seed: file.done,
          availability: 1,
        })),
      );
    },

    "/api/v2/torrents/add": async (params, res) => {
      const category = params.get("category") ?? "";
      const urls = (params.get("urls") ?? "")
        .split(/\r?\n/)
        .map((url) => url.trim())
        .filter(Boolean);
      const files = params.files("torrents");
      if (urls.length === 0 && files.length === 0) throw new HttpError(400, "Aucun torrent fourni");

      let failures = 0;
      const attempt = async (label: string, add: () => Promise<Job>) => {
        try {
          await add();
        } catch (err) {
          failures++;
          logger.error(`Ajout impossible (${label}) : ${errorMessage(err)}`);
        }
      };
      for (const url of urls) {
        const isMagnet = url.startsWith("magnet:");
        await attempt(isMagnet ? "magnet" : "URL .torrent", () =>
          isMagnet ? manager.addMagnet(url, category) : manager.addTorrentUrl(url, category),
        );
      }
      for (const file of files) {
        await attempt(file.name, async () =>
          manager.addTorrentFile(file.name, new Uint8Array(await file.arrayBuffer()), category),
        );
      }
      send(res, 200, failures > 0 ? "Fails." : "Ok.");
    },
    "/api/v2/torrents/delete": async (params, res) => {
      const deleteFiles = params.get("deleteFiles") === "true";
      for (const job of selectJobs(params.get("hashes"))) await manager.remove(job.hash, deleteFiles);
      send(res, 200, "Ok.");
    },
    "/api/v2/torrents/setCategory": (params, res) => {
      const category = params.get("category") ?? "";
      for (const job of selectJobs(params.get("hashes"))) job.category = category;
      if (category) store.addCategory(category);
      store.save();
      send(res, 200, "Ok.");
    },
    // Options de seed/priorité envoyées par les *arr : sans objet ici.
    "/api/v2/torrents/setShareLimits": ok,
    "/api/v2/torrents/setForceStart": ok,
    "/api/v2/torrents/topPrio": ok,
    "/api/v2/torrents/bottomPrio": ok,
    "/api/v2/torrents/pause": ok,
    "/api/v2/torrents/resume": ok,
    "/api/v2/torrents/stop": ok,
    "/api/v2/torrents/start": ok,
  };

  return createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    try {
      const params = await readParams(req, url);
      if (url.pathname === "/") return send(res, 200, "Connecteur-Alldebrid-Arr : API compatible qBittorrent sur /api/v2");
      if (url.pathname === "/api/v2/auth/login") return await login(params, res);
      if (!isAuthorized(req)) return send(res, 403, "Forbidden");

      const handler = routes[url.pathname];
      if (!handler) return send(res, 404, "Not Found");
      logger.debug(`${req.method} ${url.pathname}`);
      await handler(params, res);
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      if (status >= 500) logger.error(`${req.method} ${url.pathname} : ${errorMessage(err)}`);
      if (!res.headersSent) send(res, status, errorMessage(err));
    }
  });
}

function toTorrent(job: Job) {
  const progress = jobProgress(job);
  const remaining = Math.max(0, Math.round(job.size * (1 - progress)));
  return {
    hash: job.hash,
    name: job.name,
    size: job.size,
    total_size: job.size,
    progress,
    dlspeed: Math.round(job.downloadSpeed),
    upspeed: 0,
    eta: job.phase === "completed" ? 0 : job.downloadSpeed > 0 ? Math.round(remaining / job.downloadSpeed) : INFINITE_ETA,
    state: torrentState(job),
    category: job.category,
    tags: "",
    save_path: job.savePath,
    content_path: contentPath(job),
    downloaded: job.size - remaining,
    amount_left: remaining,
    uploaded: 0,
    ratio: job.phase === "completed" ? 1 : 0,
    ratio_limit: -2,
    seeding_time: 0,
    seeding_time_limit: -2,
    inactive_seeding_time_limit: -2,
    num_seeds: 0,
    num_leechs: 0,
    priority: 0,
    added_on: seconds(job.addedOn),
    completion_on: job.completedOn ? seconds(job.completedOn) : -1,
    last_activity: seconds(job.completedOn ?? Date.now()),
    auto_tmm: false,
    force_start: false,
    seq_dl: false,
    super_seeding: false,
  };
}

function jobProgress(job: Job): number {
  if (job.phase === "completed") return 1;
  if (job.files.length > 0) return ratio(downloadedBytes(job), job.size);
  return job.debridProgress;
}

/** États qBittorrent tels que Radarr/Sonarr les interprètent. */
function torrentState(job: Job): string {
  switch (job.phase) {
    case "completed":
      return "pausedUP"; // terminé : prêt à être importé puis retiré
    case "error":
      return "error";
    case "downloading":
      return "downloading";
    case "debrid":
      return job.debridStatusCode === 0 ? "queuedDL" : "downloading";
  }
}

async function readParams(req: IncomingMessage, url: URL): Promise<Params> {
  const type = req.headers["content-type"] ?? "";
  let form: FormData | undefined;
  if (req.method === "POST" && /multipart\/form-data|application\/x-www-form-urlencoded/i.test(type)) {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req as AsyncIterable<Buffer>) {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) throw new HttpError(413, "Requête trop volumineuse");
      chunks.push(chunk);
    }
    form = await new Response(Buffer.concat(chunks), { headers: { "content-type": type } }).formData();
  } else {
    req.resume();
  }
  return {
    get: (name) => {
      const value = form?.get(name);
      return typeof value === "string" ? value : url.searchParams.get(name);
    },
    files: (name) => (form?.getAll(name) ?? []).filter((value): value is File => typeof value !== "string"),
  };
}

function send(res: ServerResponse, status: number, body: string, type = "text/plain; charset=utf-8"): void {
  res.writeHead(status, { "content-type": type, "content-length": Buffer.byteLength(body) });
  res.end(body);
}

function json(res: ServerResponse, data: unknown): void {
  send(res, 200, JSON.stringify(data), "application/json");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function ratio(part: number, total: number): number {
  return total > 0 ? Math.min(1, part / total) : 0;
}

function seconds(ms: number): number {
  return Math.floor(ms / 1000);
}
