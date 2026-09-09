import "server-only";

import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

import checkDiskSpace from "check-disk-space";
import { desc } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  storageSnapshots,
  storageTreeSnapshots,
  type StorageNode,
  type StorageVolume,
} from "@/lib/db/schema";
import { env, parseStoragePaths } from "@/lib/env";

/**
 * Storage.
 *
 * Observed paths come from configuration, never from a request: there is no way
 * from outside to have an arbitrary path inspected, and nothing on the machine
 * is ever executed. The one place a request names something on the disk is
 * the explorer, in `storage-files.ts`, and it names things below a configured
 * volume only.
 *
 * The public side sees a percentage and free space. Per-volume detail stays in
 * the admin area.
 */

export type StorageOverview = {
  totalBytes: number;
  usedBytes: number;
  availableBytes: number;
  usedRatio: number;
  recordedAt: Date | null;
};

export type StorageDetail = StorageOverview & { volumes: StorageVolume[] };

/** Measures disk space for the configured volumes. */
export async function measureStorage(): Promise<{
  volumes: StorageVolume[];
  totals: Omit<StorageOverview, "recordedAt">;
}> {
  const configured = parseStoragePaths(env().STORAGE_PATHS);

  const volumes: StorageVolume[] = [];
  for (const volume of configured) {
    try {
      const space = await checkDiskSpace(volume.path);
      volumes.push({
        label: volume.label,
        totalBytes: space.size,
        availableBytes: space.free,
        usedBytes: space.size - space.free,
      });
    } catch (error) {
      // An unmounted volume must not fail the measurement of the others.
      console.warn(`[storage] unreadable volume label=${volume.label}`, error);
    }
  }

  const totalBytes = sum(volumes, (v) => v.totalBytes);
  const usedBytes = sum(volumes, (v) => v.usedBytes);
  const availableBytes = sum(volumes, (v) => v.availableBytes);

  return {
    volumes,
    totals: {
      totalBytes,
      usedBytes,
      availableBytes,
      usedRatio: totalBytes > 0 ? usedBytes / totalBytes : 0,
    },
  };
}

/** Records one measurement. This is what builds the history. */
export async function recordStorageSnapshot() {
  const { volumes, totals } = await measureStorage();
  if (volumes.length === 0) return null;

  const [snapshot] = await db()
    .insert(storageSnapshots)
    .values({
      totalBytes: totals.totalBytes,
      usedBytes: totals.usedBytes,
      availableBytes: totals.availableBytes,
      volumes,
    })
    .returning({ id: storageSnapshots.id });

  return snapshot.id;
}

async function latestSnapshot() {
  const [row] = await db()
    .select()
    .from(storageSnapshots)
    .orderBy(desc(storageSnapshots.recordedAt))
    .limit(1);
  return row ?? null;
}

/** Latest measurement without per-volume detail. Public. */
export async function storageOverview(): Promise<StorageOverview | null> {
  const row = await latestSnapshot();
  if (!row) return null;
  return {
    totalBytes: row.totalBytes,
    usedBytes: row.usedBytes,
    availableBytes: row.availableBytes,
    usedRatio: row.totalBytes > 0 ? row.usedBytes / row.totalBytes : 0,
    recordedAt: row.recordedAt,
  };
}

/** Detailed measurement, admin only. */
export async function storageDetail(): Promise<StorageDetail | null> {
  const row = await latestSnapshot();
  if (!row) return null;
  return {
    totalBytes: row.totalBytes,
    usedBytes: row.usedBytes,
    availableBytes: row.availableBytes,
    usedRatio: row.totalBytes > 0 ? row.usedBytes / row.totalBytes : 0,
    recordedAt: row.recordedAt,
    volumes: row.volumes,
  };
}

/** History, for the admin trend view. */
export async function storageHistory(limit = 60) {
  return db()
    .select({
      recordedAt: storageSnapshots.recordedAt,
      totalBytes: storageSnapshots.totalBytes,
      usedBytes: storageSnapshots.usedBytes,
      availableBytes: storageSnapshots.availableBytes,
    })
    .from(storageSnapshots)
    .orderBy(desc(storageSnapshots.recordedAt))
    .limit(limit);
}

function sum<T>(items: T[], pick: (item: T) => number) {
  return items.reduce((total, item) => total + pick(item), 0);
}

/* ------------------------------------------------------------------ tree -- */

/**
 * What actually fills the disk.
 *
 * `check-disk-space` answers "how full", never "with what", and that second
 * question is the one an administrator asks before deleting anything. Umbra
 * runs on the media server, so it can simply walk the configured paths.
 *
 * The walk stays inside those paths: it never follows a symbolic link, and no
 * path ever arrives from a request. What leaves the server is a tree of names
 * and sizes, rooted at the label the operator chose, never an absolute path.
 */

/**
 * Where the walk is, for whoever is watching it.
 *
 * The walk takes minutes on a media library, which is long enough that a page
 * showing nothing but a spinner is a page that looks broken. The counter is
 * passed down the recursion and read from above; writing it down is somebody
 * else's problem, and throttled there.
 */
export type ScanReport = (progress: {
  items: number;
  bytes: number;
  where?: string;
}) => void;

type ScanCounter = {
  files: number;
  bytes: number;
  where: string | null;
  report?: ScanReport;
};

/** Deep enough for volume, library, series, season, episode, and one spare. */
const MAX_DEPTH = 6;
/** Below this share of its parent an entry is a pixel, so it is folded away. */
const MIN_SHARE = 0.004;
/** Hard ceiling per level, so one directory of ten thousand files cannot win. */
const MAX_CHILDREN = 40;
/** Directories walked at once. Enough to hide the latency, not a thundering herd. */
const CONCURRENCY = 8;

export type StorageTree = {
  roots: StorageNode[];
  totalBytes: number;
  fileCount: number;
  durationMs: number;
  scannedAt: Date;
};

/**
 * Walks the configured volumes and records one snapshot.
 *
 * Slow by nature, so it belongs to the scheduled job and to the explicit
 * "measure now" button, never to a page render.
 */
export async function scanStorageTree(
  report?: ScanReport,
): Promise<StorageTree | null> {
  const configured = parseStoragePaths(env().STORAGE_PATHS);
  if (configured.length === 0) return null;

  const startedAt = Date.now();
  const roots: StorageNode[] = [];
  const counter: ScanCounter = { files: 0, bytes: 0, where: null, report };

  for (const volume of configured) {
    counter.where = volume.label;
    try {
      const node = await walk(volume.path, volume.label, 0, counter);
      if (node) roots.push(node);
    } catch (error) {
      // An unmounted or unreadable volume must not lose the others.
      console.warn(`[storage] unreadable root label=${volume.label}`, error);
    }
  }
  if (roots.length === 0) return null;

  roots.sort((a, b) => b.bytes - a.bytes);
  const tree: StorageTree = {
    roots: roots.map((root) => prune(root)),
    totalBytes: roots.reduce((total, root) => total + root.bytes, 0),
    fileCount: counter.files,
    durationMs: Date.now() - startedAt,
    scannedAt: new Date(),
  };

  await db().insert(storageTreeSnapshots).values({
    roots: tree.roots,
    totalBytes: tree.totalBytes,
    fileCount: tree.fileCount,
    durationMs: tree.durationMs,
  });

  return tree;
}

/** The last measured tree, which is what the administration reads. */
export async function storageTree(): Promise<StorageTree | null> {
  const [row] = await db()
    .select()
    .from(storageTreeSnapshots)
    .orderBy(desc(storageTreeSnapshots.scannedAt))
    .limit(1);
  if (!row) return null;

  return {
    roots: row.roots,
    totalBytes: row.totalBytes,
    fileCount: row.fileCount,
    durationMs: row.durationMs,
    scannedAt: row.scannedAt,
  };
}

/**
 * One directory, then its children.
 *
 * Entries are read without following links: a symbolic link is counted as
 * nothing rather than walked, which is what stops a loop and what stops a link
 * pointing outside the volume from being measured as if it were inside it.
 */
async function walk(
  path: string,
  name: string,
  depth: number,
  counter: ScanCounter,
): Promise<StorageNode | null> {
  let entries;
  try {
    entries = await readdir(path, { withFileTypes: true });
  } catch {
    // A directory the server may not read is not an error worth stopping for.
    return { name, bytes: 0, kind: "directory", children: [] };
  }

  const children: StorageNode[] = [];
  let bytes = 0;

  const directories = entries.filter((entry) => entry.isDirectory());
  const files = entries.filter((entry) => entry.isFile());

  for (const file of files) {
    try {
      const info = await stat(join(path, file.name));
      counter.files += 1;
      counter.bytes += info.size;
      counter.report?.({
        items: counter.files,
        bytes: counter.bytes,
        where: counter.where ?? undefined,
      });
      bytes += info.size;
      if (depth < MAX_DEPTH)
        children.push({ name: file.name, bytes: info.size, kind: "file" });
    } catch {
      // A file that vanished between the listing and the measurement.
    }
  }

  // Below the depth limit the sizes still count, only the detail is dropped.
  const walked = await mapWithLimit(directories, CONCURRENCY, (entry) =>
    walk(join(path, entry.name), entry.name, depth + 1, counter),
  );
  for (const child of walked) {
    if (!child) continue;
    bytes += child.bytes;
    if (depth < MAX_DEPTH) children.push(child);
  }

  return { name, bytes, kind: "directory", children };
}

/**
 * Folds away what could not be drawn.
 *
 * A treemap cannot show a rectangle worth four tenths of a percent, and a
 * snapshot carrying a hundred thousand of them is a snapshot nobody can load.
 * What is folded is still counted, and the node says how many entries went.
 */
function prune(node: StorageNode): StorageNode {
  if (!node.children || node.children.length === 0) {
    return node.kind === "file"
      ? { name: node.name, bytes: node.bytes, kind: node.kind }
      : { name: node.name, bytes: node.bytes, kind: node.kind, children: [] };
  }

  const sorted = [...node.children].sort((a, b) => b.bytes - a.bytes);
  const kept = sorted
    .slice(0, MAX_CHILDREN)
    .filter((child) => child.bytes >= node.bytes * MIN_SHARE);
  const folded = sorted.length - kept.length;

  return {
    name: node.name,
    bytes: node.bytes,
    kind: node.kind,
    ...(folded > 0 ? { truncated: folded } : {}),
    children: kept.map((child) => prune(child)),
  };
}

/** Runs `work` over `items`, at most `limit` at a time, in order. */
async function mapWithLimit<T, R>(
  items: T[],
  limit: number,
  work: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, () =>
    (async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await work(items[index]);
      }
    })(),
  );

  await Promise.all(workers);
  return results;
}
