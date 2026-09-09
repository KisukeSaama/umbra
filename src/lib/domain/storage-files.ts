import "server-only";

import { createReadStream } from "node:fs";
import { lstat, readdir, realpath, rm, stat } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { Readable } from "node:stream";

import { BadRequestError, ConflictError, NotFoundError } from "@/lib/errors";
import { env, parseStoragePaths, type StorageVolumeConfig } from "@/lib/env";

/**
 * The files themselves.
 *
 * The map says where the room went; this is where it is taken back. It is the
 * one place in Umbra where a request names something on the disk, so the
 * frontier is drawn here and nowhere else (see
 * `docs/adr/0012-files-are-deleted-from-the-storage-page.md`).
 *
 * A request never carries an absolute path. It carries the label of a volume
 * the operator configured and a list of names below it, one directory per
 * name. Each name is checked on its own (no separator, no `.` or `..`), the
 * joined path is checked against the volume's real root, and a symbolic link
 * is never followed, listed as anything but a link, or deleted: what lies
 * outside the volume cannot be reached even by something that points at it.
 *
 * Reading is a listing of one directory, never a walk, and one video at a
 * time streamed as it is on disk. Writing is deletion, nothing else: no
 * rename, no move, no upload, and a deletion is refused at the root of a
 * volume, which is the only depth where a single click could take a whole
 * library with it.
 */

export type StorageEntry = {
  name: string;
  kind: "directory" | "file";
  /** The file is a video the explorer can try to play. */
  playable?: boolean;
  /** Files only: a directory is weighed on demand, not on every listing. */
  bytes: number | null;
  modifiedAt: string;
};

export type StorageListing = {
  volume: string;
  /** Names from the volume root down to the listed directory. */
  path: string[];
  entries: StorageEntry[];
};

export type StorageWeight = {
  bytes: number;
  files: number;
  /** True when the count stopped at the cap, so the figures are a floor. */
  partial: boolean;
};

export type StorageDeletion = {
  deleted: string[];
  failed: string[];
};

/** Names below the root before a listing is refused as absurd. */
const MAX_DEPTH = 32;
/** One name, as the file system itself bounds it. */
const MAX_NAME_LENGTH = 255;
/** Entries per deletion; a bigger batch is several batches. */
export const MAX_BATCH = 200;
/** Files counted while weighing before the answer is called a floor. */
const MAX_WEIGHED_FILES = 50_000;

function configuredVolumes(): StorageVolumeConfig[] {
  return parseStoragePaths(env().STORAGE_PATHS);
}

/** Refuses anything that is not a plain name inside one directory. */
export function isSafeName(name: string): boolean {
  if (typeof name !== "string") return false;
  if (name.length === 0 || name.length > MAX_NAME_LENGTH) return false;
  if (name === "." || name === "..") return false;
  if (name.includes("/") || name.includes("\\") || name.includes("\0"))
    return false;
  return true;
}

function assertNames(names: string[]) {
  if (!Array.isArray(names) || names.length > MAX_DEPTH)
    throw new BadRequestError("error.invalidPath");
  for (const name of names)
    if (!isSafeName(name)) throw new BadRequestError("error.invalidPath");
}

/**
 * The directory a request points at, or an error.
 *
 * Two checks, because each catches what the other cannot. The lexical one
 * stops a joined path from leaving the root, which `..` in a name would do.
 * The real one stops a link inside the volume from leading outside it, which
 * only the file system can tell.
 */
async function locate(
  volumeLabel: string,
  path: string[],
  volumes: StorageVolumeConfig[],
): Promise<{ root: string; target: string }> {
  const volume = volumes.find((entry) => entry.label === volumeLabel);
  if (!volume) throw new NotFoundError("error.invalidPath");
  assertNames(path);

  const root = resolve(volume.path);
  const target = resolve(root, ...path);
  if (target !== root && !target.startsWith(root + sep))
    throw new BadRequestError("error.invalidPath");

  let realRoot: string;
  let realTarget: string;
  try {
    realRoot = await realpath(root);
    realTarget = await realpath(target);
  } catch {
    throw new NotFoundError("error.pathNotFound");
  }
  if (realTarget !== realRoot && !realTarget.startsWith(realRoot + sep))
    throw new BadRequestError("error.invalidPath");

  // Walking through a link is refused even when it lands inside the volume:
  // what is listed must be what will be deleted, and a link is neither.
  let current = root;
  for (const name of path) {
    current = join(current, name);
    const info = await lstat(current).catch(() => null);
    if (!info) throw new NotFoundError("error.pathNotFound");
    if (info.isSymbolicLink()) throw new BadRequestError("error.invalidPath");
  }

  return { root, target };
}

/** One directory, listed. Staff. */
export async function listStorageDirectory(
  volume: string,
  path: string[],
  volumes = configuredVolumes(),
): Promise<StorageListing> {
  const { target } = await locate(volume, path, volumes);

  let dirents;
  try {
    dirents = await readdir(target, { withFileTypes: true });
  } catch {
    throw new NotFoundError("error.pathNotFound");
  }

  const entries: StorageEntry[] = [];
  for (const dirent of dirents) {
    // Links and special files are not shown at all: nothing here can act on
    // them, and a name that cannot be acted on is a name that misleads.
    if (dirent.isSymbolicLink()) continue;
    if (!dirent.isDirectory() && !dirent.isFile()) continue;
    try {
      const info = await stat(join(target, dirent.name));
      const playable = dirent.isFile() && videoType(dirent.name) !== null;
      entries.push({
        name: dirent.name,
        kind: dirent.isDirectory() ? "directory" : "file",
        ...(playable ? { playable } : {}),
        bytes: dirent.isFile() ? info.size : null,
        modifiedAt: info.mtime.toISOString(),
      });
    } catch {
      // Gone between the listing and the measurement.
    }
  }

  entries.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, {
      numeric: true,
      sensitivity: "base",
    });
  });

  return { volume, path, entries };
}

/**
 * What a selection weighs, before it is deleted.
 *
 * A listing does not carry directory sizes because measuring them is a walk,
 * and a walk on every click is the treemap's job. Here the walk is bounded and
 * asked once, for the confirmation, which is the one moment the figure matters.
 */
export async function weighStorageEntries(
  volume: string,
  path: string[],
  names: string[],
  volumes = configuredVolumes(),
): Promise<StorageWeight> {
  const { target } = await locate(volume, path, volumes);
  assertNames(names);
  if (names.length > MAX_BATCH) throw new BadRequestError("error.invalidPath");

  const weight: StorageWeight = { bytes: 0, files: 0, partial: false };
  for (const name of names) {
    if (weight.partial) break;
    await weigh(join(target, name), weight);
  }
  return weight;
}

async function weigh(path: string, weight: StorageWeight) {
  const info = await lstat(path).catch(() => null);
  if (!info || info.isSymbolicLink()) return;

  if (info.isFile()) {
    weight.bytes += info.size;
    weight.files += 1;
    if (weight.files >= MAX_WEIGHED_FILES) weight.partial = true;
    return;
  }
  if (!info.isDirectory()) return;

  const dirents = await readdir(path, { withFileTypes: true }).catch(() => []);
  for (const dirent of dirents) {
    if (weight.partial) return;
    await weigh(join(path, dirent.name), weight);
  }
}

/**
 * Deletes a batch of names inside one directory. Administrator only.
 *
 * Each name goes on its own, so one that fails (vanished, not writable) does
 * not stop the rest, and the caller learns exactly which ones went. A
 * directory goes with everything in it; the confirmation said so.
 */
export async function deleteStorageEntries(
  volume: string,
  path: string[],
  names: string[],
  volumes = configuredVolumes(),
): Promise<StorageDeletion> {
  const { target } = await locate(volume, path, volumes);
  assertNames(names);
  if (names.length === 0 || names.length > MAX_BATCH)
    throw new BadRequestError("error.invalidPath");
  // The root itself is never among the names: a deletion is always of
  // something below it, and the shallowest thing deletable is a direct child.

  const result: StorageDeletion = { deleted: [], failed: [] };
  let readOnly = false;

  for (const name of names) {
    const entry = join(target, name);
    const info = await lstat(entry).catch(() => null);
    // Already gone is the outcome that was asked for.
    if (!info) {
      result.deleted.push(name);
      continue;
    }
    if (info.isSymbolicLink() || (!info.isFile() && !info.isDirectory())) {
      result.failed.push(name);
      continue;
    }
    try {
      await rm(entry, { recursive: info.isDirectory(), force: false });
      result.deleted.push(name);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "EROFS" || code === "EACCES" || code === "EPERM")
        readOnly = true;
      console.warn(`[storage] delete failed name=${name} code=${code}`);
      result.failed.push(name);
    }
  }

  // Nothing went and the disk said why: the volume is mounted without write
  // access, which is a deployment fact worth saying in so many words.
  if (result.deleted.length === 0 && readOnly)
    throw new ConflictError("error.storageReadOnly");

  return result;
}

/* ---------------------------------------------------------------- video -- */

/**
 * Containers a browser has a chance with, and the type it should be told.
 *
 * The browser decodes what it decodes: MP4 and WebM everywhere, Matroska with
 * H.264 or HEVC and AAC in Chromium, less elsewhere. Umbra does not transcode,
 * because the machine already runs something that does, and doing it twice
 * is how a media server stops serving media. What is served is the file as it
 * is, with range requests so seeking works, and the player says so when the
 * format is one it cannot read.
 */
const VIDEO_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
  ".avi": "video/x-msvideo",
  ".ts": "video/mp2t",
  ".m2ts": "video/mp2t",
  ".wmv": "video/x-ms-wmv",
  ".ogv": "video/ogg",
};

export function videoType(name: string): string | null {
  return VIDEO_TYPES[extname(name).toLowerCase()] ?? null;
}

export type StorageStream = {
  body: ReadableStream;
  status: 200 | 206;
  headers: Record<string, string>;
};

/** A range the file cannot satisfy; the player is told the real size. */
export class RangeNotSatisfiableError extends Error {
  constructor(readonly size: number) {
    super("range not satisfiable");
    this.name = "RangeNotSatisfiableError";
  }
}

/**
 * One video, as bytes.
 *
 * The range header is honoured because a player without it cannot seek and a
 * file of forty gigabytes cannot be read from the start every time. The
 * response is the plain file, uncached: this is one administrator's look,
 * not a page.
 */
export async function openStorageVideo(
  volume: string,
  path: string[],
  name: string,
  range: string | null,
  volumes = configuredVolumes(),
): Promise<StorageStream> {
  const { target } = await locate(volume, path, volumes);
  if (!isSafeName(name)) throw new BadRequestError("error.invalidPath");
  const type = videoType(name);
  if (!type) throw new BadRequestError("error.notPlayable");

  const file = join(target, name);
  const info = await lstat(file).catch(() => null);
  if (!info || !info.isFile()) throw new NotFoundError("error.pathNotFound");

  const size = info.size;
  let start = 0;
  let end = size - 1;
  let status: 200 | 206 = 200;

  const match = range ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null;
  if (match) {
    const [, from, to] = match;
    if (from === "" && to === "")
      throw new BadRequestError("error.invalidPath");
    if (from === "") {
      // A suffix range, the last N bytes, which is how some players probe.
      start = Math.max(0, size - Number(to));
    } else {
      start = Number(from);
      if (to !== "") end = Math.min(Number(to), size - 1);
    }
    if (
      Number.isNaN(start) ||
      Number.isNaN(end) ||
      start > end ||
      start >= size
    )
      throw new RangeNotSatisfiableError(size);
    status = 206;
  }

  const stream = createReadStream(file, { start, end });
  const headers: Record<string, string> = {
    "Content-Type": type,
    "Content-Length": String(end - start + 1),
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
    "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(name)}`,
  };
  if (status === 206)
    headers["Content-Range"] = `bytes ${start}-${end}/${size}`;

  return {
    body: Readable.toWeb(stream) as ReadableStream,
    status,
    headers,
  };
}
