import "server-only";

import { env } from "@/lib/env";
import { BadRequestError, NotFoundError, UpstreamError } from "@/lib/errors";
import { janus } from "@/lib/janus";
import {
  type DiscoverQuery,
  type EpisodeInfo,
  type Genre,
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

/**
 * Release dates are regional. Without this, "in cinemas soon" is answered with
 * United States dates, which are weeks off for this audience.
 */
export function tmdbRegion(language?: string) {
  return language === "fr" ? "FR" : "US";
}

/** TMDB refuses anything past page 500. */
function safePage(page: number | undefined) {
  return Math.min(500, Math.max(1, Math.trunc(page ?? 1)));
}

/**
 * The sort field is not the same on both sides: a film has a release date, a
 * show has a first air date. The domain asks for an intent and the provider
 * decides how to spell it.
 */
function sortFor(kind: MediaKind, sortBy: DiscoverQuery["sortBy"]) {
  if (sortBy === "recent")
    return kind === "movie"
      ? "primary_release_date.desc"
      : "first_air_date.desc";
  if (sortBy === "rating") return "vote_average.desc";
  return "popularity.desc";
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

  async trending(language) {
    // `/trending/all` is the one listing that names its own kinds, and it also
    // returns people, which `parseMediaKind` drops.
    const body = await get<{ results?: unknown[] }>(
      "/trending/all/week",
      language,
    );
    return (body.results ?? [])
      .map((row) => summaryFromJson(row))
      .filter((row): row is MediaSummary => row !== null);
  },

  async discoverBy({ kind, genreIds, runtimeLte, sortBy, page, language }) {
    const query: Record<string, string | number> = {
      include_adult: "false",
      page: safePage(page),
      sort_by: sortFor(kind, sortBy),
      // Without a floor, sorting by rating surfaces films with three votes.
      "vote_count.gte": sortBy === "rating" ? 200 : 50,
    };
    // A pipe is "any of these", a comma would demand all of them at once.
    if (genreIds?.length) query.with_genres = genreIds.join("|");
    // On a show this parameter filters the length of one episode, which is a
    // different question, so it is only ever sent for a film.
    if (runtimeLte && kind === "movie") query["with_runtime.lte"] = runtimeLte;

    const body = await get<{ results?: unknown[] }>(
      `/discover/${kind}`,
      language,
      query,
    );
    return summariesOfKind(body.results, kind);
  },

  async upcoming(kind, language) {
    if (kind === "movie") {
      const body = await get<{ results?: unknown[] }>(
        "/movie/upcoming",
        language,
        { region: tmdbRegion(language), page: 1 },
      );
      return summariesOfKind(body.results, "movie");
    }
    // There is no `/tv/upcoming`. `on_the_air` answers "airing right now",
    // which is the useful question for a server that follows series.
    const body = await get<{ results?: unknown[] }>(
      "/tv/on_the_air",
      language,
      {
        page: 1,
      },
    );
    return summariesOfKind(body.results, "tv");
  },

  async recommendations(kind, providerId, language) {
    const body = await get<{ results?: unknown[] }>(
      `/${kind}/${numericId(providerId)}/recommendations`,
      language,
    );
    // This listing sometimes carries `media_type` and sometimes does not, so
    // the kind is imposed rather than read.
    return summariesOfKind(body.results, kind);
  },

  async genres(kind, language) {
    const body = await get<{ genres?: unknown[] }>(
      `/genre/${kind}/list`,
      language,
    );
    return (body.genres ?? [])
      .map(genreFromJson)
      .filter((genre): genre is Genre => genre !== null);
  },
};

function summariesOfKind(rows: unknown[] | undefined, kind: MediaKind) {
  return (rows ?? [])
    .map((row) => summaryFromJsonWithKind(row, kind))
    .filter((row): row is MediaSummary => row !== null);
}

export function genreFromJson(row: unknown): Genre | null {
  if (!isJson(row)) return null;
  const id = int(row, "id");
  const name = str(row, "name");
  return id !== null && name ? { id, name } : null;
}

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
    genreIds: genreIdsFrom(row),
  };
}

/**
 * A listing row carries `genre_ids`, a details payload carries `genres` as
 * objects. Reading both means the library index can be stamped with genres by
 * the pass that already asks for the details, at no extra call.
 */
export function genreIdsFrom(row: unknown): number[] {
  if (!isJson(row)) return [];
  if (Array.isArray(row.genre_ids))
    return row.genre_ids.filter(
      (id): id is number => typeof id === "number" && Number.isFinite(id),
    );
  if (Array.isArray(row.genres))
    return row.genres
      .map((genre) => (isJson(genre) ? int(genre, "id") : null))
      .filter((id): id is number => id !== null);
  return [];
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
