import type { SeasonState } from "@/lib/domain/catalog";
import { dayKey } from "@/lib/format";

/**
 * "Is it all there", in one place.
 *
 * A pure leaf: the badge on a season, the wording under a series and the button
 * that asks for the rest all read the same rule, so the panel can never claim a
 * season is complete while offering to ask for its missing episodes.
 *
 * A season the provider has not numbered yet is judged on what the server holds
 * alone: claiming a shortfall against an unknown total would invent one.
 */
export function isSeasonComplete(season: SeasonState): boolean {
  if (season.episodeCount <= 0) return season.onServer > 0;
  return season.onServer >= season.episodeCount;
}

/** Nothing of that season is on the server yet. */
export function isSeasonMissing(season: SeasonState): boolean {
  return season.onServer === 0;
}

/**
 * A season that exists beyond an announcement.
 *
 * The provider lists a season as soon as it is announced, often with no episode
 * and no date, or with a date still to come. Nothing of it can be on the server
 * yet, so it is neither a shortfall nor something to ask for. A season the
 * server already holds some of has obviously been broadcast, whatever the
 * provider says.
 */
export function isSeasonReleased(
  season: SeasonState,
  now: Date = new Date(),
): boolean {
  if (season.onServer > 0) return true;
  if (season.episodeCount <= 0 || !season.airDate) return false;
  return !isUnaired(season.airDate, now);
}

/**
 * A series that is on the server without being all there.
 *
 * Unknown seasons mean unknown, not incomplete: a provider that could not be
 * reached leaves the list empty, and that is not a shortfall to report. A
 * season only announced is not a shortfall either.
 */
export function isSeriesIncomplete(
  seasons: SeasonState[],
  now: Date = new Date(),
): boolean {
  return seasons.some(
    (season) => isSeasonReleased(season, now) && !isSeasonComplete(season),
  );
}

/**
 * An episode the provider has dated in the future has not been broadcast yet.
 *
 * Its absence from the server is a schedule, not a shortfall: the list says
 * when it is due rather than marking it as something the server is late on.
 */
export function isUnaired(
  airDate: string | null,
  now: Date = new Date(),
): boolean {
  if (!airDate) return false;
  // Compared as days rather than as instants, so this says the same thing as
  // the reconciliation that raises the task: see `dayKey`.
  return airDate > dayKey(now);
}
