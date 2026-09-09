/**
 * Metadata provider contract.
 *
 * Domain code only knows this interface: TMDB is the first implementation, and
 * another source (TVDB) can be added later without touching callers.
 */

export type MediaKind = "movie" | "tv";

/** What a result card needs to display. */
export type MediaSummary = {
  provider: string;
  providerId: string;
  kind: MediaKind;
  title: string;
  originalTitle: string | null;
  overview: string | null;
  /** `YYYY-MM-DD` */
  releaseDate: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  /** Only used to rank search results. */
  popularity: number;
};

export type SeasonSummary = {
  seasonNumber: number;
  episodeCount: number;
  airDate: string | null;
};

export type EpisodeInfo = {
  providerEpisodeId: string | null;
  seasonNumber: number;
  episodeNumber: number;
  title: string | null;
  /** Scheduled broadcast date. Never means "available". */
  airDate: string | null;
};

export type SeriesDetails = {
  summary: MediaSummary;
  /** Raw provider status (`Returning Series`, `Ended`, ...). */
  status: string | null;
  inProduction: boolean;
  seasons: SeasonSummary[];
  nextEpisode: EpisodeInfo | null;
  lastEpisode: EpisodeInfo | null;
};

/**
 * `language` is the visitor's detected language (`fr` or `en`); implementations
 * map it to whatever their API expects.
 */
export interface MediaMetadataProvider {
  readonly name: string;
  search(query: string, language?: string): Promise<MediaSummary[]>;
  details(
    kind: MediaKind,
    providerId: string,
    language?: string,
  ): Promise<MediaSummary>;
  seriesDetails(providerId: string, language?: string): Promise<SeriesDetails>;
  seasonEpisodes(
    providerId: string,
    season: number,
    language?: string,
  ): Promise<EpisodeInfo[]>;
}

/** A finished show no longer needs a daily sync. */
export function isRunning(
  details: Pick<SeriesDetails, "status" | "inProduction">,
) {
  if (details.inProduction) return true;
  return (
    details.status === "Returning Series" ||
    details.status === "In Production" ||
    details.status === "Planned"
  );
}

export function parseMediaKind(
  raw: string | null | undefined,
): MediaKind | null {
  if (raw === "movie") return "movie";
  if (raw === "tv" || raw === "show" || raw === "series") return "tv";
  return null;
}
