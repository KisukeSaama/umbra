import type { SeasonState } from "@/lib/domain/catalog";

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
 * A series that is on the server without being all there.
 *
 * Unknown seasons mean unknown, not incomplete: a provider that could not be
 * reached leaves the list empty, and that is not a shortfall to report.
 */
export function isSeriesIncomplete(seasons: SeasonState[]): boolean {
  return seasons.length > 0 && !seasons.every(isSeasonComplete);
}
