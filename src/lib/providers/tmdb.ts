import "server-only";

import { env } from "@/lib/env";
import { BadRequestError, NotFoundError, UpstreamError } from "@/lib/errors";
import { janus } from "@/lib/janus";
import {
  type EpisodeInfo,
  type MediaKind,
  type MediaMetadataProvider,
  type MediaSummary,
  parseMediaKind,
} from "@/lib/providers/metadata";

/**
 * TMDB implementation, through Janus (`/gateway/tmdb-v3`).
 *
 * No API key here: Janus adds it. No cache either: Janus holds one.
 */

export const TMDB_PROVIDER = "tmdb";

/** Public TMDB image base: no secret, served straight to the browser. */
const IMAGE_BASE = "https://image.tmdb.org/t/p";

export function posterUrl(
  path: string | null | undefined,
  size: "w342" | "w500" = "w342",
) {
  return path ? `${IMAGE_BASE}/${size}${path}` : null;
}

/**
 * TMDB expects a full locale; Umbra only carries a language. Calls made outside
 * a request, by a job, get the default locale rather than a guess.
 */
export function tmdbLanguage(language?: string) {
  return language === "fr" ? "fr-FR" : "en-US";
}

type Json = Record<string, unknown>;

async function get<T = Json>(
  path: string,
  language: string | undefined,
  query: Record<string, string | number> = {},
) {
  return janus<T>({
    slug: env().JANUS_METADATA_SLUG,
    path,
    query: { language: tmdbLanguage(language), ...query },
  });
}

export const tmdbProvider: MediaMetadataProvider = {
  name: TMDB_PROVIDER,

  async search(query, language) {
    const body = await get<{ results?: unknown[] }>("/search/multi", language, {
      query,
      include_adult: "false",
      page: 1,
    });
    return (body.results ?? [])
      .map((row) => summaryFromJson(row))
      .filter((row): row is MediaSummary => row !== null)
      .sort((a, b) => b.popularity - a.popularity);
  },

  async details(kind, providerId, language) {
    const body = await get(`/${kind}/${numericId(providerId)}`, language);
    const summary = summaryFromJsonWithKind(body, kind);
    if (!summary) throw new NotFoundError("error.titleNotFound");
    return summary;
  },

  async seriesDetails(providerId, language) {
    const body = await get<Json>(`/tv/${numericId(providerId)}`, language);
    const summary = summaryFromJsonWithKind(body, "tv");
    if (!summary)
      throw new UpstreamError(
        env().JANUS_METADATA_SLUG,
        "unreadable series payload",
      );

    const seasons = Array.isArray(body.seasons) ? (body.seasons as Json[]) : [];
    return {
      summary,
      status: str(body, "status"),
      inProduction: body.in_production === true,
      seasons: seasons
        .map((season) => {
          const seasonNumber = int(season, "season_number");
          if (seasonNumber === null) return null;
          return {
            seasonNumber,
            episodeCount: int(season, "episode_count") ?? 0,
            airDate: str(season, "air_date"),
          };
        })
        .filter(
          (season): season is NonNullable<typeof season> => season !== null,
        ),
      nextEpisode: episodeFromJson(body.next_episode_to_air),
      lastEpisode: episodeFromJson(body.last_episode_to_air),
    };
  },

  async seasonEpisodes(providerId, season, language) {
    const body = await get<{ episodes?: unknown[] }>(
      `/tv/${numericId(providerId)}/season/${Math.trunc(season)}`,
      language,
    );
    return (body.episodes ?? [])
      .map(episodeFromJson)
      .filter((episode): episode is EpisodeInfo => episode !== null);
  },
};

/**
 * TMDB ids are numeric, so anything else is refused before a path is built: a
 * `..` or an encoded separator would get the call rejected by Janus anyway.
 */
export function numericId(providerId: string): number {
  if (!/^\d+$/.test(providerId))
    throw new BadRequestError("error.invalidProviderId");
  return Number(providerId);
}

export function summaryFromJson(row: unknown): MediaSummary | null {
  if (!isJson(row)) return null;
  const kind = parseMediaKind(
    typeof row.media_type === "string" ? row.media_type : null,
  );
  return kind ? summaryFromJsonWithKind(row, kind) : null;
}

export function summaryFromJsonWithKind(
  row: unknown,
  kind: MediaKind,
): MediaSummary | null {
  if (!isJson(row)) return null;
  const providerId = idOf(row);
  if (!providerId) return null;

  const [titleKey, originalKey, dateKey] =
    kind === "movie"
      ? (["title", "original_title", "release_date"] as const)
      : (["name", "original_name", "first_air_date"] as const);

  const title = str(row, titleKey) ?? str(row, "title");
  if (!title) return null;

  const originalTitle = str(row, originalKey);
  return {
    provider: TMDB_PROVIDER,
    providerId,
    kind,
    title,
    // An original title identical to the title adds nothing on screen.
    originalTitle:
      originalTitle && originalTitle !== title ? originalTitle : null,
    overview: str(row, "overview"),
    releaseDate: str(row, dateKey),
    posterPath: str(row, "poster_path"),
    backdropPath: str(row, "backdrop_path"),
    popularity: typeof row.popularity === "number" ? row.popularity : 0,
  };
}

export function episodeFromJson(row: unknown): EpisodeInfo | null {
  if (!isJson(row)) return null;
  const seasonNumber = int(row, "season_number");
  const episodeNumber = int(row, "episode_number");
  if (seasonNumber === null || episodeNumber === null) return null;

  return {
    providerEpisodeId: idOf(row),
    seasonNumber,
    episodeNumber,
    title: str(row, "name"),
    airDate: str(row, "air_date"),
  };
}

function isJson(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function idOf(row: Json): string | null {
  const raw = row.id;
  if (typeof raw === "number") return String(raw);
  if (typeof raw === "string" && raw.length > 0) return raw;
  return null;
}

function str(row: Json, key: string): string | null {
  const raw = row[key];
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function int(row: Json, key: string): number | null {
  const raw = row[key];
  return typeof raw === "number" && Number.isFinite(raw)
    ? Math.trunc(raw)
    : null;
}
