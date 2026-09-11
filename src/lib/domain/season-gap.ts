import type { ReportReason } from "@/lib/db/schema";
import { seasonEpisodes } from "@/lib/domain/catalog";
import { seasonShortfall } from "@/lib/domain/seasons";
import { formatEpisodeRuns } from "@/lib/format";

/**
 * What an ask for the rest of a season means in files, for whoever answers it.
 *
 * "Episodes are missing" is what the member could say; the administration needs
 * how many to fetch and which, spelled the way an indexer is searched. Only a
 * season asked for as a whole has a gap to measure: anything else is null.
 *
 * `missing` is zero when the provider could not be reached, or when the gap has
 * been filled since the ask: `held` is then still true on its own.
 */
export async function seasonGap(report: {
  reason: ReportReason;
  seasonNumber: number | null;
  episodeNumber: number | null;
  media: { providerId: string };
}): Promise<{
  missing: number;
  held: number;
  aired: number;
  codes: string;
} | null> {
  if (
    report.reason !== "missing_episode" ||
    report.seasonNumber === null ||
    report.episodeNumber !== null
  )
    return null;

  const episodes = await seasonEpisodes(
    report.media.providerId,
    report.seasonNumber,
  );
  const { aired, missing, runs } = seasonShortfall(episodes);
  return {
    missing,
    held: aired - missing,
    aired,
    codes: formatEpisodeRuns(report.seasonNumber, runs),
  };
}
