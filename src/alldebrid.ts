import { setTimeout as sleep } from "node:timers/promises";

const API_URL = "https://api.alldebrid.com";
const REQUEST_TIMEOUT_MS = 60_000;

/** Codes de statut d'un magnet (voir https://docs.alldebrid.com/#status). */
export const MAGNET_READY = 4;
export const MAGNET_FIRST_ERROR = 5;

export class AllDebridError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AllDebridError";
  }
}

interface ApiError {
  code: string;
  message: string;
}

interface ApiResponse<T> {
  status: "success" | "error";
  data?: T;
  error?: ApiError;
}

interface UploadItem {
  id: number;
  name: string;
  size: number;
  ready: boolean;
  error?: ApiError;
}

interface FileEntry {
  n: string;
  s?: number;
  l?: string;
  e?: FileEntry[];
}

export interface AccountInfo {
  username: string;
  isPremium: boolean;
  /** Fin de l'abonnement premium (timestamp Unix en secondes). */
  premiumUntil?: number;
}

export interface UploadedMagnet {
  id: number;
  name: string;
  size: number;
  ready: boolean;
}

export interface MagnetStatus {
  id: number;
  filename: string;
  size: number;
  status: string;
  statusCode: number;
  downloaded: number;
  downloadSpeed: number;
}

export interface DebridFile {
  /** Chemin du fichier dans le torrent, segment par segment. */
  path: string[];
  size: number;
  /** Lien AllDebrid à débrider avant téléchargement. */
  link: string;
}

export class AllDebridClient {
  constructor(
    private readonly apiKey: string,
    private readonly agent: string,
  ) {}

  async getUser(): Promise<AccountInfo> {
    const data = await this.call<{ user: AccountInfo }>("/v4/user");
    return data.user;
  }

  async uploadMagnet(magnet: string): Promise<UploadedMagnet> {
    const data = await this.call<{ magnets: UploadItem[] }>("/v4/magnet/upload", { "magnets[]": magnet });
    return uploaded(data.magnets[0]);
  }

  async uploadTorrentFile(fileName: string, content: Uint8Array): Promise<UploadedMagnet> {
    const form = new FormData();
    form.append("files[]", new Blob([new Uint8Array(content)], { type: "application/x-bittorrent" }), fileName);
    const data = await this.call<{ files: UploadItem[] }>("/v4/magnet/upload/file", form);
    return uploaded(data.files[0]);
  }

  async getMagnetStatus(id: number): Promise<MagnetStatus> {
    const data = await this.call<{ magnets: MagnetStatus | MagnetStatus[] }>("/v4.1/magnet/status", { id: String(id) });
    const magnet = Array.isArray(data.magnets) ? data.magnets.find((m) => Number(m.id) === id) : data.magnets;
    if (!magnet) throw new AllDebridError("MAGNET_INVALID_ID", `Magnet ${id} introuvable sur AllDebrid`);
    return magnet;
  }

  async getMagnetFiles(id: number): Promise<DebridFile[]> {
    const data = await this.call<{ magnets: { files?: FileEntry[]; error?: ApiError }[] }>("/v4/magnet/files", {
      "id[]": String(id),
    });
    const magnet = data.magnets[0];
    if (!magnet || magnet.error) {
      throw new AllDebridError(
        magnet?.error?.code ?? "MAGNET_INVALID_ID",
        magnet?.error?.message ?? `Fichiers du magnet ${id} introuvables`,
      );
    }
    return flatten(magnet.files ?? []);
  }

  /** Transforme un lien AllDebrid en lien de téléchargement direct. */
  async unlockLink(link: string, signal?: AbortSignal): Promise<string> {
    const data = await this.call<{ link: string; delayed?: number }>("/v4/link/unlock", { link }, signal);
    if (!data.delayed) return data.link;

    // Certains liens sont générés en différé : on interroge AllDebrid jusqu'à ce qu'il soit prêt.
    for (let attempt = 0; attempt < 60; attempt++) {
      await sleep(5000, undefined, { signal });
      const delayed = await this.call<{ status: number; link?: string }>(
        "/v4/link/delayed",
        { id: String(data.delayed) },
        signal,
      );
      if (delayed.status === 2 && delayed.link) return delayed.link;
      if (delayed.status === 3) throw new AllDebridError("DELAYED_FAILED", "AllDebrid n'a pas pu générer le lien");
    }
    throw new AllDebridError("DELAYED_TIMEOUT", "Délai dépassé pour la génération du lien");
  }

  async deleteMagnet(id: number): Promise<void> {
    await this.call("/v4/magnet/delete", { id: String(id) });
  }

  private async call<T>(
    endpoint: string,
    params: Record<string, string> | FormData = {},
    signal?: AbortSignal,
  ): Promise<T> {
    const url = new URL(endpoint, API_URL);
    url.searchParams.set("agent", this.agent);
    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);

    const response = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}` },
      body: params instanceof FormData ? params : new URLSearchParams(params),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    const body = (await response.json().catch(() => undefined)) as ApiResponse<T> | undefined;
    if (body?.status === "success" && body.data !== undefined) return body.data;
    throw new AllDebridError(
      body?.error?.code ?? `HTTP_${response.status}`,
      body?.error?.message ?? `Réponse inattendue d'AllDebrid (HTTP ${response.status})`,
    );
  }
}

function uploaded(item: UploadItem | undefined): UploadedMagnet {
  if (!item || item.error) {
    throw new AllDebridError(item?.error?.code ?? "UPLOAD_FAILED", item?.error?.message ?? "Envoi refusé par AllDebrid");
  }
  return { id: item.id, name: item.name, size: item.size, ready: item.ready };
}

function flatten(entries: FileEntry[], parent: string[] = []): DebridFile[] {
  return entries.flatMap((entry) => {
    if (entry.e) return flatten(entry.e, [...parent, entry.n]);
    return entry.l ? [{ path: [...parent, entry.n], size: entry.s ?? 0, link: entry.l }] : [];
  });
}
