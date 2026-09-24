import { createHash } from "node:crypto";

export interface TorrentInfo {
  /** Info hash en hexadécimal minuscule, tel que Radarr/Sonarr le suivent. */
  hash: string;
  name?: string;
}

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function parseMagnet(uri: string): TorrentInfo {
  if (!uri.startsWith("magnet:?")) throw new Error("Lien magnet invalide");
  const params = new URLSearchParams(uri.slice("magnet:?".length));
  const name = params.get("dn") ?? undefined;

  for (const xt of params.getAll("xt")) {
    const id = /^urn:btih:([a-z0-9]+)$/i.exec(xt)?.[1];
    if (!id) continue;
    if (/^[0-9a-f]{40}$/i.test(id)) return { hash: id.toLowerCase(), name };
    if (/^[a-z2-7]{32}$/i.test(id)) return { hash: base32ToHex(id), name };
  }
  throw new Error("Lien magnet invalide : hash btih introuvable");
}

function base32ToHex(value: string): string {
  const bits = [...value.toUpperCase()].map((char) => BASE32.indexOf(char).toString(2).padStart(5, "0")).join("");
  return bits
    .match(/.{4}/g)!
    .map((nibble) => parseInt(nibble, 2).toString(16))
    .join("");
}

/** Calcule l'info hash (SHA-1 du dictionnaire « info ») d'un fichier .torrent. */
export function parseTorrentFile(data: Uint8Array): TorrentInfo {
  const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  let pos = 0;

  const fail = (): never => {
    throw new Error("Fichier .torrent invalide");
  };
  const find = (byte: number): number => {
    const index = buf.indexOf(byte, pos);
    return index < 0 ? fail() : index;
  };
  const readString = (): string => {
    const colon = find(0x3a); // ':'
    const length = Number(buf.toString("ascii", pos, colon));
    if (!Number.isInteger(length) || colon + 1 + length > buf.length) fail();
    pos = colon + 1 + length;
    return buf.toString("utf8", colon + 1, pos);
  };
  const skip = (): void => {
    const byte = buf[pos];
    if (byte === 0x69) {
      pos = find(0x65) + 1; // i<entier>e
    } else if (byte === 0x6c || byte === 0x64) {
      pos++; // l…e ou d…e
      while (buf[pos] !== 0x65) {
        if (pos >= buf.length) fail();
        skip();
      }
      pos++;
    } else if (byte >= 0x30 && byte <= 0x39) {
      readString();
    } else {
      fail();
    }
  };

  if (buf[pos] !== 0x64) fail();
  pos++;
  while (pos < buf.length && buf[pos] !== 0x65) {
    if (readString() !== "info") {
      skip();
      continue;
    }
    const start = pos;
    skip();
    const end = pos;
    const hash = createHash("sha1").update(buf.subarray(start, end)).digest("hex");

    let name: string | undefined;
    pos = start + 1;
    while (pos < end - 1) {
      if (readString() === "name") name = readString();
      else skip();
    }
    return { hash, name };
  }
  return fail();
}
