import "server-only";

import { createReadStream } from "node:fs";
import {
  mkdir,
  readdir,
  rename,
  stat,
  unlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

import { and, eq, inArray } from "drizzle-orm";

import type { CurrentAccount } from "@/lib/auth/session";
import { UPLOAD_KEY_PATTERN } from "@/lib/announcements";
import { db } from "@/lib/db";
import { announcements } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { ConflictError } from "@/lib/errors";
import { imageSize, processImage } from "@/lib/images";

/**
 * The visuals attached to notes, on disk.
 *
 * One flat directory, `UPLOADS_PATH`, holding files Umbra wrote itself and
 * named after their own digest: `<sha256>.webp`. Nothing here takes a path from
 * a request. A key is checked against `UPLOAD_KEY_PATTERN` before it is turned
 * into a file name, so the most a caller can name is a file of this directory
 * that has the shape of one Umbra wrote.
 *
 * A file is written when the staff drop it in the composer, before the note
 * that will carry it exists, so the directory always holds a few pictures
 * nobody kept. They are not tracked: `sweepOrphanUploads` lists the directory
 * and removes what no note names once it has been left alone for a day, which
 * also covers a note deleted and a visual replaced. See
 * `docs/adr/0022-uploaded-visuals-and-the-featured-note.md`.
 */

/** How long an unclaimed file is left for the composer that sent it. */
const ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000;

/** Files looked at per sweep, so a large backlog drains over several runs. */
const SWEEP_BATCH = 500;

const FILE_PATTERN = /^([0-9a-f]{64})\.webp$/;
const PARTIAL_PATTERN = /^[0-9a-f]{64}\.webp\.partial-[0-9a-z]+$/;

function root(): string {
  return path.resolve(env().UPLOADS_PATH);
}

function fileOf(key: string): string | null {
  return UPLOAD_KEY_PATTERN.test(key) ? path.join(root(), `${key}.webp`) : null;
}

/** A refusal of the file system that the operator, not the code, has to fix. */
function isUnwritable(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === "EROFS" || code === "EACCES" || code === "EPERM";
}

function isMissing(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === "ENOENT";
}

export type StoredUpload = { key: string; width: number; height: number };

/**
 * Re-encodes a picture and keeps it.
 *
 * The same picture dropped twice is the same file, since the name is the
 * digest of what is written. It is not written again, only touched, so the
 * sweep counts its day from the last time somebody wanted it. A new file is
 * written beside its final name and renamed into place, so a reader never
 * meets half of one.
 */
export async function storeUpload(bytes: Uint8Array): Promise<StoredUpload> {
  const image = await processImage(bytes);
  const target = path.join(root(), `${image.key}.webp`);

  try {
    await mkdir(root(), { recursive: true });
    try {
      const now = new Date();
      await utimes(target, now, now);
    } catch (error) {
      if (!isMissing(error)) throw error;
      const partial = `${target}.partial-${Date.now().toString(36)}`;
      await writeFile(partial, image.data, { mode: 0o640 });
      await rename(partial, target);
    }
  } catch (error) {
    if (isUnwritable(error)) throw new ConflictError("error.uploadsUnwritable");
    throw error;
  }

  return { key: image.key, width: image.width, height: image.height };
}

/**
 * The dimensions of a stored file, or `null` when there is no such file.
 *
 * What a note is given when a visual is attached to it: read from the file on
 * this side rather than taken from the request, so the size the feed reserves
 * is the size of the picture it will receive.
 */
export async function describeUpload(
  key: string,
): Promise<{ width: number; height: number } | null> {
  const file = fileOf(key);
  return file ? imageSize(file) : null;
}

/**
 * Whether this reader may see this visual.
 *
 * The staff see every file, since the composer previews a picture before any
 * note carries it. A member sees the visual of a published note and nothing
 * else: a draft's picture, or one whose note was deleted and that the sweep
 * has yet to reach, is not theirs to load even with its address in hand.
 */
export async function canReadUpload(
  key: string,
  account: Pick<CurrentAccount, "role">,
): Promise<boolean> {
  if (!UPLOAD_KEY_PATTERN.test(key)) return false;
  if (account.role !== "member") return true;
  const [row] = await db()
    .select({ id: announcements.id })
    .from(announcements)
    .where(
      and(eq(announcements.imageKey, key), eq(announcements.published, true)),
    )
    .limit(1);
  return Boolean(row);
}

/** A stored file as a stream, or `null` when it is not there. */
export async function openUpload(
  key: string,
): Promise<{ body: ReadableStream<Uint8Array>; size: number } | null> {
  const file = fileOf(key);
  if (!file) return null;
  try {
    const info = await stat(file);
    if (!info.isFile()) return null;
    const stream = createReadStream(file);
    return {
      body: Readable.toWeb(stream) as ReadableStream<Uint8Array>,
      size: info.size,
    };
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

/**
 * Removes the files no note names any more.
 *
 * Idempotent and indifferent to when it runs: it compares each file's age
 * with now and asks the table which keys are still in use, so a sweep missed
 * during downtime is caught up by the next one. A file is only removed once
 * it has gone a day untouched, which leaves the composer that just sent it
 * time to save the note. Leftovers of a write interrupted half way go the same
 * way. Answers how many files went.
 */
export async function sweepOrphanUploads(now = new Date()): Promise<number> {
  let names: string[];
  try {
    names = await readdir(root());
  } catch (error) {
    if (isMissing(error)) return 0;
    throw error;
  }

  const cutoff = now.getTime() - ORPHAN_GRACE_MS;
  const stale: { name: string; key: string | null }[] = [];
  for (const name of names) {
    if (stale.length >= SWEEP_BATCH) break;
    const match = FILE_PATTERN.exec(name);
    if (!match && !PARTIAL_PATTERN.test(name)) continue;
    try {
      const info = await stat(path.join(root(), name));
      if (info.isFile() && info.mtimeMs < cutoff)
        stale.push({ name, key: match ? match[1] : null });
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
  }
  if (stale.length === 0) return 0;

  const keys = stale.flatMap(({ key }) => (key ? [key] : []));
  const used = new Set(
    keys.length === 0
      ? []
      : (
          await db()
            .select({ key: announcements.imageKey })
            .from(announcements)
            .where(inArray(announcements.imageKey, keys))
        ).map(({ key }) => key),
  );

  let removed = 0;
  for (const { name, key } of stale) {
    if (key && used.has(key)) continue;
    const file = path.join(root(), name);
    try {
      // Asked again just before: the same picture dropped in the composer a
      // moment ago touched the file, and it is wanted again.
      if ((await stat(file)).mtimeMs >= cutoff) continue;
      await unlink(file);
      removed += 1;
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
  }
  return removed;
}
