import "server-only";

import { env } from "@/lib/env";
import { BadRequestError, NotFoundError, UpstreamError } from "@/lib/errors";
import { janus } from "@/lib/janus";
import {
  type CastCredit,
  type DiscoverQuery,
  type EpisodeInfo,
  type Genre,
  type MediaKind,
  type MediaMetadataProvider,
  type MediaSummary,
  parseMediaKind,
  type PersonCredit,
  type PersonRef,
  type PersonRole,
  type TitleCredits,
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

/** A portrait is shown at card size at most, so the small rendition is enough. */
export function profileUrl(path: string | null | undefined) {
  return path ? `${IMAGE_BASE}/w185${path}` : null;
}

/**
 * The genre that says a title is drawn. Everyone credited in its cast lends a
 * voice rather than a face, whether or not the provider marks the role so.
 */
export const ANIMATION_GENRE_ID = 16;

/**
 * News and talk shows. An actor is credited on them for turning up as
 * themselves, which is not a role, and a filmography full of late-night
 * interviews buries the work.
 */
const APPEARANCE_GENRE_IDS = [10763, 10767];

/** How TMDB marks a voice role inside the character name. */
const VOICE_MARKER = /\s*\((?:voice|voix)\)\s*/i;

/** A credit for playing oneself, in either language the provider answers in. */
const SELF_CREDIT =
  /^(?:self|himself|herself|themselves|lui-m[eê]me|elle-m[eê]me)\b/i;

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

/**
 * The floor under "sort by rating".
 *
 * Sorting by average with a low floor does not return the best titles, it
 * returns the least voted ones: a film released last month with four hundred
 * votes outranks Seven. The threshold is not the same on both sides because a
 * show collects far fewer votes than a film of the same standing.
 */
function voteFloor(kind: MediaKind, sortBy: DiscoverQuery["sortBy"]) {
  if (sortBy !== "rating") return 50;
  return kind === "movie" ? 1000 : 600;
}

/**
 * The floor under the score itself.
 *
 * The vote count says a title has been seen, not that it was worth it, and
 * sorting by average only protects the top of the first page: a narrow mood
 * rolled to its fourth page, or a shelf that gave up its vote floor to come
 * back with anything at all, ends well below where it started. Discovery is
 * Umbra suggesting something, so the score is a condition of the query rather
 * than a property of the order, and it holds wherever the listing is read.
 *
 * The value sits just above the middle of the scale, where TMDB averages
 * cluster: high enough that the bottom half cannot be suggested, low enough
 * that it removes a shelf from no mood. It is exported because the library
 * index stores the same provider score: the two halves of the picker answer the
 * same question, so they cannot hold different bars.
 */
export const RATING_FLOOR = 6.5;

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

/**
 * The discover call, expressed as parameters.
 *
 * Pure and exported so the filters can be read without a gateway: this is where
 * a mood stops being a set of answers and becomes a listing, and the floors it
 * carries are the difference between a suggestion and a row of results.
 */
export function discoverParams({
  kind,
  genreIds,
  excludeGenreIds,
  requireGenreIds,
  originalLanguage,
  runtimeLte,
  releasedFrom,
  releasedTo,
  shortSeries,
  sortBy,
  voteCountGte,
  voteAverageGte,
  page,
}: DiscoverQuery): Record<string, string | number> {
  const query: Record<string, string | number> = {
    include_adult: "false",
    page: safePage(page),
    sort_by: sortFor(kind, sortBy),
    "vote_count.gte": voteCountGte ?? voteFloor(kind, sortBy),
    "vote_average.gte": voteAverageGte ?? RATING_FLOOR,
  };
  // A pipe is "any of these", a comma demands all of them at once, and TMDB
  // takes one or the other in a value. The genres a title must carry go up
  // with the query whenever the mood leaves room for a comma: filtered after
  // the fact instead, "anime before 1980" read a page of Kurosawa sorted by
  // score and kept nothing of it. `discoverBy` still filters the rest.
  const required = requireGenreIds ?? [];
  if (required.length > 0 && (genreIds?.length ?? 0) <= 1)
    query.with_genres = [...new Set([...required, ...(genreIds ?? [])])].join(
      ",",
    );
  else if (genreIds?.length) query.with_genres = genreIds.join("|");
  if (excludeGenreIds?.length) query.without_genres = excludeGenreIds.join("|");
  if (originalLanguage) query.with_original_language = originalLanguage;
  // On a show this parameter filters the length of one episode, which is a
  // different question, so it is only ever sent for a film.
  if (runtimeLte && kind === "movie") {
    query["with_runtime.lte"] = runtimeLte;
    // A runtime the provider does not know is stored as zero and would pass
    // the ceiling: an unknown length never answers "under two hours".
    query["with_runtime.gte"] = 1;
  }
  // The same year is spelt on a different field on each side, like the sort.
  const dateField =
    kind === "movie" ? "primary_release_date" : "first_air_date";
  if (releasedFrom) query[`${dateField}.gte`] = `${releasedFrom}-01-01`;
  if (releasedTo) query[`${dateField}.lte`] = `${releasedTo}-12-31`;
  if (shortSeries && kind === "tv") {
    query.with_status = 3; // Ended
    query.with_type = 2; // Miniseries
  }
  return query;
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
      lastEpisode: episodeFromJson(body.last_episode_to_air),
      nextEpisode: episodeFromJson(body.next_episode_to_air),
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

  async discoverBy(query) {
    const params = discoverParams(query);
    if (query.keyword) {
      const keywords = await get<{ results?: Json[] }>(
        "/search/keyword",
        undefined,
        { query: query.keyword },
      );
      const keyword = keywords.results?.find(
        (item) => item.name === query.keyword,
      );
      if (!keyword || !idOf(keyword)) return [];
      params.with_keywords = idOf(keyword)!;
    }
    const body = await get<{ results?: unknown[] }>(
      `/discover/${query.kind}`,
      query.language,
      params,
    );
    const { kind, requireGenreIds, excludeOriginalLanguages } = query;
    const rows = summariesOfKind(body.results, kind);
    // TMDB reads a comma in `with_genres` as "all of these" and a pipe as "any
    // of these", and it does not accept the two mixed in one value: a mood is
    // already a union, so the genres that have to be there on top of it are
    // applied here, on rows that carry their own list.
    return rows.filter(
      (row) =>
        (!requireGenreIds?.length ||
          requireGenreIds.every((id) => row.genreIds.includes(id))) &&
        !excludeOriginalLanguages?.includes(row.originalLanguage ?? ""),
    );
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

  async credits(kind, providerId, language) {
    const id = numericId(providerId);
    if (kind === "movie") {
      const body = await get(`/movie/${id}/credits`, language);
      return titleCreditsFromJson("movie", body, null);
    }
    // `/credits` on a show only lists the latest season; the aggregate is
    // everyone across the whole run. The creators are on the show itself,
    // which the title page has just asked for, so Janus answers from its cache.
    const [body, show] = await Promise.all([
      get(`/tv/${id}/aggregate_credits`, language),
      get(`/tv/${id}`, language),
    ]);
    return titleCreditsFromJson("tv", body, show.created_by);
  },

  async person(personId, language) {
    const body = await get(`/person/${numericId(personId)}`, language, {
      append_to_response: "combined_credits",
    });
    const person = personRefFromJson(body);
    if (!person) throw new NotFoundError("error.personNotFound");
    return {
      ...person,
      knownFor: str(body, "known_for_department"),
      credits: personCreditsFromJson(body.combined_credits),
    };
  },

  async collection(collectionId, language) {
    const body = await get(`/collection/${numericId(collectionId)}`, language);
    const collection = collectionRefFromJson(body);
    if (!collection) throw new NotFoundError("error.titleNotFound");
    return {
      ...collection,
      parts: summariesOfKind(
        Array.isArray(body.parts) ? body.parts : [],
        "movie",
      ),
    };
  },
};

/** A saga as a film's details name it, or as its own payload does. */
export function collectionRefFromJson(row: unknown) {
  if (!isJson(row)) return null;
  const collectionId = idOf(row);
  const name = str(row, "name");
  return collectionId && name ? { collectionId, name } : null;
}

export function personRefFromJson(row: unknown): PersonRef | null {
  if (!isJson(row)) return null;
  const personId = idOf(row);
  const name = str(row, "name");
  if (!personId || !name) return null;
  return { personId, name, profilePath: str(row, "profile_path") };
}

/**
 * One cast row. A film row carries `character`; an aggregated show row carries
 * `roles`, one per character played, and the one played in the most episodes
 * is the one the show is known for.
 */
export function castFromJson(row: unknown): CastCredit | null {
  const person = personRefFromJson(row);
  if (!person || !isJson(row)) return null;

  const raw = str(row, "character") ?? mainRole(row);
  const voice = raw !== null && VOICE_MARKER.test(raw);
  const character = raw ? raw.replace(VOICE_MARKER, " ").trim() || null : null;
  return { ...person, character, voice };
}

function mainRole(row: Json): string | null {
  if (!Array.isArray(row.roles)) return null;
  const roles = row.roles
    .filter(isJson)
    .sort(
      (a, b) => (int(b, "episode_count") ?? 0) - (int(a, "episode_count") ?? 0),
    );
  for (const role of roles) {
    const character = str(role, "character");
    if (character) return character;
  }
  return null;
}

/**
 * Who signs a title, and who is in it.
 *
 * A show is signed by its creators. Many shows name none, anime above all, and
 * then the series director stands in: the per-episode directors are a crowd
 * rather than a signature, so they are never read here.
 */
export function titleCreditsFromJson(
  kind: MediaKind,
  credits: unknown,
  createdBy: unknown,
): TitleCredits {
  const body = isJson(credits) ? credits : {};
  const cast = (Array.isArray(body.cast) ? body.cast : [])
    .map(castFromJson)
    .filter(present);
  const crew = (Array.isArray(body.crew) ? body.crew : []).filter(isJson);

  const leadJob = kind === "movie" ? "Director" : "Series Director";
  const directors = crew
    .filter((row) => jobsOf(row).includes(leadJob))
    .map(personRefFromJson)
    .filter(present);
  const creators = (Array.isArray(createdBy) ? createdBy : [])
    .map(personRefFromJson)
    .filter(present);

  return {
    leads: uniquePeople(creators.length > 0 ? creators : directors),
    cast: uniquePeople(cast),
  };
}

/** A film crew row names one job; an aggregated show row lists several. */
function jobsOf(row: Json): string[] {
  const job = str(row, "job");
  if (job) return [job];
  if (!Array.isArray(row.jobs)) return [];
  return row.jobs
    .map((entry) => (isJson(entry) ? str(entry, "job") : null))
    .filter(present);
}

/** Someone credited twice (director and writer, two characters) is one card. */
function uniquePeople<T extends PersonRef>(people: T[]): T[] {
  const seen = new Set<string>();
  return people.filter((person) => {
    if (seen.has(person.personId)) return false;
    seen.add(person.personId);
    return true;
  });
}

/**
 * Everything one person is credited on, as roles a member can browse by.
 *
 * Adult titles, talk shows and playing oneself are left out: none of them is
 * work anybody comes to a person's page for. The same title can come back
 * under two roles, directed and written, and it is kept under both.
 */
export function personCreditsFromJson(raw: unknown): PersonCredit[] {
  const body = isJson(raw) ? raw : {};
  const credits: PersonCredit[] = [];

  for (const row of Array.isArray(body.cast) ? body.cast : []) {
    const summary = workFrom(row);
    if (!summary) continue;
    const character = isJson(row) ? str(row, "character") : null;
    if (character && SELF_CREDIT.test(character)) continue;
    const voice =
      (character !== null && VOICE_MARKER.test(character)) ||
      summary.genreIds.includes(ANIMATION_GENRE_ID);
    credits.push({ summary, role: voice ? "voice" : "cast" });
  }

  for (const row of Array.isArray(body.crew) ? body.crew : []) {
    const summary = workFrom(row);
    if (!summary || !isJson(row)) continue;
    const role = roleOfJob(str(row, "job"), str(row, "department"));
    if (role) credits.push({ summary, role });
  }

  return credits;
}

function workFrom(row: unknown): MediaSummary | null {
  if (!isJson(row) || row.adult === true) return null;
  const summary = summaryFromJson(row);
  if (!summary) return null;
  return summary.genreIds.some((id) => APPEARANCE_GENRE_IDS.includes(id))
    ? null
    : summary;
}

/** Only the jobs that sign a title; the rest of the crew is not browsed by. */
function roleOfJob(
  job: string | null,
  department: string | null,
): PersonRole | null {
  if (job === "Director" || job === "Series Director") return "director";
  if (job === "Creator") return "creator";
  if (department === "Writing") return "writer";
  return null;
}

function present<T>(value: T | null): value is T {
  return value !== null;
}

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
    runtime: int(row, "runtime"),
    popularity: typeof row.popularity === "number" ? row.popularity : 0,
    genreIds: genreIdsFrom(row),
    originalLanguage: str(row, "original_language"),
    voteAverage:
      typeof row.vote_average === "number" && Number.isFinite(row.vote_average)
        ? row.vote_average
        : null,
    voteCount:
      typeof row.vote_count === "number" && Number.isFinite(row.vote_count)
        ? row.vote_count
        : 0,
    // Only a details payload names its genres, so a listing row stays without.
    ...(Array.isArray(row.genres)
      ? { genres: row.genres.map(genreFromJson).filter(present) }
      : {}),
    // Same: only a film's details name the saga it belongs to.
    ...("belongs_to_collection" in row
      ? { collection: collectionRefFromJson(row.belongs_to_collection) }
      : {}),
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
