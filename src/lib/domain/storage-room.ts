import type { StorageNode } from "@/lib/db/schema";

/**
 * What the free space means to somebody who does not count in terabytes.
 *
 * A member reads "1.2 TB free" and learns nothing: the figure is only worth
 * something next to the thing it holds. So the public side says both, the
 * capacity and what it comes to in films and episodes, and speaks up about it
 * only when there is something to say. Everything here is pure, so the rules
 * are tested without a disk or a database.
 */

/** How the server stands, in three words rather than a gauge. */
export type StorageState = "roomy" | "tight" | "full";

/** From here the bar takes the lamp and the card says how long is left. */
export const TIGHT_RATIO = 0.85;
/** From here a member about to ask for something is told. */
export const FULL_RATIO = 0.95;

/** At this pace or closer, the disk is tight whatever its ratio says. */
const TIGHT_DAYS = 60;
/** At this pace or closer, it is full in every sense a member cares about. */
const FULL_DAYS = 14;

/**
 * How far back the pace is read. Long enough that one big season landing does
 * not read as a trend, short enough to follow what the server does now.
 */
export const PACE_WINDOW_DAYS = 30;
/** Below this much history a pace is a guess, and it is not printed. */
const PACE_MIN_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A folder directly under a series is a season. The names are the ones media
 * servers and the tools that feed them write, in the languages they write them.
 */
const SEASON_FOLDER =
  /^(season|saison|staffel|temporada|stagione|specials|sp[eé]ciaux|s\d{1,2}$)/i;

export type TypicalSizes = {
  /** What a film usually weighs here, or null when there is nothing to go on. */
  movieBytes: number | null;
  /** What an episode usually weighs here, or null likewise. */
  episodeBytes: number | null;
};

/**
 * What a title typically weighs on this server, read from the measured tree.
 *
 * The tree goes volume, library, title. A title folder holding season folders
 * is a series; any other title folder is a film, extras and all. A film is
 * weighed by the median, so one remux does not make every film look huge. An
 * episode is not a folder, so its weight is the series total over the number
 * of episodes the library index holds.
 */
export function typicalSizes(
  roots: StorageNode[],
  episodeCount: number,
): TypicalSizes {
  const movies: number[] = [];
  let seriesBytes = 0;

  for (const volume of roots) {
    for (const library of volume.children ?? []) {
      for (const title of library.children ?? []) {
        if (title.kind !== "directory" || title.bytes <= 0) continue;
        const isSeries = (title.children ?? []).some((child) =>
          SEASON_FOLDER.test(child.name),
        );
        if (isSeries) seriesBytes += title.bytes;
        else movies.push(title.bytes);
      }
    }
  }

  return {
    movieBytes: median(movies),
    episodeBytes:
      seriesBytes > 0 && episodeCount > 0
        ? Math.round(seriesBytes / episodeCount)
        : null,
  };
}

/** How many of something the free space holds, or null when unknown. */
export function roomFor(
  availableBytes: number,
  unitBytes: number | null,
): number | null {
  if (!unitBytes || unitBytes <= 0) return null;
  return Math.max(0, Math.floor(availableBytes / unitBytes));
}

/**
 * A count said the way a person says it: exact while it is small, rounded
 * once the last digits stop meaning anything. The card says "about" anyway.
 */
export function roughly(count: number): number {
  if (count < 20) return count;
  if (count < 100) return Math.round(count / 5) * 5;
  if (count < 1000) return Math.round(count / 10) * 10;
  return Math.round(count / 100) * 100;
}

/**
 * Days until the disk is full at the pace it filled over the window, or null
 * when there is no pace to speak of: too little history, or a disk that is
 * holding steady or emptying. Two readings, the oldest in the window and the
 * latest, because deletions make anything finer read as noise.
 */
export function daysLeft(
  from: { recordedAt: Date; usedBytes: number },
  to: { recordedAt: Date; usedBytes: number; availableBytes: number },
): number | null {
  const days = (to.recordedAt.getTime() - from.recordedAt.getTime()) / DAY_MS;
  if (days < PACE_MIN_DAYS) return null;

  const perDay = (to.usedBytes - from.usedBytes) / days;
  if (perDay <= 0) return null;

  return Math.floor(to.availableBytes / perDay);
}

/** The state, from how full the disk is and how fast it is filling. */
export function storageState(
  usedRatio: number,
  days: number | null,
): StorageState {
  if (usedRatio >= FULL_RATIO || (days !== null && days <= FULL_DAYS))
    return "full";
  if (usedRatio >= TIGHT_RATIO || (days !== null && days <= TIGHT_DAYS))
    return "tight";
  return "roomy";
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}
