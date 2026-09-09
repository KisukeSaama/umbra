import "server-only";

import checkDiskSpace from "check-disk-space";
import { desc } from "drizzle-orm";

import { db } from "@/lib/db";
import { storageSnapshots, type StorageVolume } from "@/lib/db/schema";
import { env, parseStoragePaths } from "@/lib/env";

/**
 * Storage.
 *
 * Observed paths come from configuration, never from a request: there is no way
 * from outside to have an arbitrary path inspected, and nothing on the machine
 * is ever executed.
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
