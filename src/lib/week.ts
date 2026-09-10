import type { EpisodeInfo } from "@/lib/providers/metadata";

/**
 * What "this week" means for a show.
 *
 * A week either side of today: the episode that came out a few days ago is as
 * much news as the one due on Friday, and the member who is on the show wants
 * both. Pure, so the rule reads without a provider or a database.
 */

export const WEEK_DAYS = 7;

/** `YYYY-MM-DD` shifted by a number of days, in UTC like the air dates. */
export function shiftDate(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Today as the provider writes a date. */
export function today(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * The broadcasts of one show that fall inside the week around `day`.
 *
 * The provider names the last episode and the next one; either can be missing,
 * undated or far away, and the same episode can be both on the day it airs.
 */
export function episodesInWeek(
  show: { lastEpisode: EpisodeInfo | null; nextEpisode: EpisodeInfo | null },
  day: string,
): EpisodeInfo[] {
  const from = shiftDate(day, -WEEK_DAYS);
  const to = shiftDate(day, WEEK_DAYS);
  const seen = new Set<string>();

  return [show.lastEpisode, show.nextEpisode].filter(
    (episode): episode is EpisodeInfo => {
      if (!episode?.airDate) return false;
      if (episode.airDate < from || episode.airDate > to) return false;
      const key = `${episode.seasonNumber}:${episode.episodeNumber}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    },
  );
}

/**
 * Where a broadcast stands for the server: here, late, or still to come. The
 * same three answers as the tracker gives, reached without tracking the show.
 */
export function weekStatus(
  airDate: string,
  onServer: boolean,
  day: string,
): "available" | "aired_missing" | "scheduled" {
  if (onServer) return "available";
  return airDate <= day ? "aired_missing" : "scheduled";
}
