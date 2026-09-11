import type {
  DiscoverQuery,
  MediaKind,
  MediaSummary,
} from "@/lib/providers/metadata";
import type { AnimeRef } from "@/lib/providers/myanimelist";

/**
 * Matching an anime between TMDB and MyAnimeList.
 *
 * The two catalogues share no id, so the match is made on what both know: a
 * title, a format and a year. These rules are pure so the cases that go wrong
 * quietly can be pinned: a recap special taken for the series, a live-action
 * adaptation taken for the anime, a sequel shown next to the show it belongs to.
 */

/** TMDB's Animation genre. */
const ANIMATION = 16;

/**
 * What makes a TMDB title an anime here: drawn, and made in Japanese. The genre
 * alone answers with Pixar, and the language alone with every drama from Tokyo.
 */
export function isAnime(
  title: Pick<MediaSummary, "genreIds" | "originalLanguage">,
): boolean {
  return title.genreIds.includes(ANIMATION) && title.originalLanguage === "ja";
}

/**
 * The MAL formats that can stand for a TMDB kind. TMDB files a web series as a
 * show and has no separate format for it; specials and recaps are left out on
 * both sides, because they carry the name of the show they summarise.
 */
const FORMATS: Record<MediaKind, string[]> = {
  tv: ["tv", "ona"],
  movie: ["movie"],
};

/**
 * The MAL entry that is this TMDB title, or nothing.
 *
 * Candidates come in MAL's own relevance order, which is kept. A year is only
 * held against a candidate when both sides know it, and one year of slack
 * covers a show announced in December and aired in January.
 */
export function matchAnime(
  title: Pick<MediaSummary, "kind" | "releaseDate">,
  candidates: AnimeRef[],
): AnimeRef | null {
  const year = yearOf(title.releaseDate);
  return (
    candidates.find((candidate) => {
      if (!candidate.mediaType) return false;
      if (!FORMATS[title.kind].includes(candidate.mediaType)) return false;
      const start = yearOf(candidate.startDate);
      return year === null || start === null || Math.abs(start - year) <= 1;
    }) ?? null
  );
}

/**
 * A MAL title as a search TMDB can answer. MAL tells two entries of one name
 * apart with a suffix, `Mirai Nikki (TV)`, which TMDB has never heard of.
 */
export function searchableTitle(title: string): string {
  return title.replace(/\s*\((?:tv|movie|ona|ova)\)\s*$/i, "").trim();
}

/**
 * The TMDB row that is a MAL recommendation, among a search's results.
 *
 * Only an anime is accepted, so a title shared with a live-action adaptation
 * or an unrelated film is not taken for it. A show is preferred over a film of
 * the same name, because most recommendations are shows and a franchise's film
 * usually carries the name of the series before it.
 */
export function pickTmdbMatch(
  rows: MediaSummary[],
  kind?: MediaKind,
): MediaSummary | null {
  const anime = rows.filter(
    (row) => isAnime(row) && (!kind || row.kind === kind),
  );
  return anime.find((row) => row.kind === "tv") ?? anime[0] ?? null;
}

/**
 * An anime scored by MAL's members rather than TMDB's visitors.
 *
 * Both sites score out of ten, so the number is taken as it is, never scaled.
 * The vote count follows the score, because the two are one fact and every
 * floor downstream reads them together. A title MAL has not scored keeps
 * TMDB's.
 */
export function withMalScore<T extends MediaSummary>(
  row: T,
  anime: Pick<AnimeRef, "score" | "scoringUsers"> | null,
): T {
  if (!anime || anime.score === null) return row;
  return {
    ...row,
    voteAverage: anime.score,
    voteCount: anime.scoringUsers,
    scoreSource: "myanimelist",
  };
}

/**
 * A picker query that asks for anime: drawn, and in Japanese. Only those are
 * answered from MAL's ranking; every other listing stays with TMDB.
 */
export function isAnimeQuery(query: DiscoverQuery): boolean {
  return (
    query.originalLanguage === "ja" &&
    Boolean(query.requireGenreIds?.includes(ANIMATION))
  );
}

/**
 * The moods, spelt in MAL's genres.
 *
 * The picker speaks TMDB genre ids, and TMDB files an anime under a handful of
 * broad ones (Animation, Action & Adventure, Sci-Fi & Fantasy), so a mood read
 * from TMDB alone barely narrows an anime list. MAL's genres are finer and its
 * members fill them in, which is why the mood is applied on that side.
 */
const MAL_GENRES: Record<number, string[]> = {
  35: ["Comedy"],
  53: ["Suspense", "Psychological"],
  9648: ["Mystery", "Suspense", "Psychological"],
  80: ["Detective", "Organized Crime"],
  27: ["Horror"],
  12: ["Adventure"],
  10759: ["Action", "Adventure"],
  10749: ["Romance"],
  10766: ["Romance"],
  18: ["Drama"],
  878: ["Sci-Fi"],
  10765: ["Sci-Fi", "Fantasy"],
};

/** The TMDB keywords a show mood stands on, in MAL's genres. */
const MAL_KEYWORDS: Record<string, string[]> = {
  horror: ["Horror"],
  romance: ["Romance"],
};

export type MalGenreFilter = {
  /** Any one of these is enough; null lets every genre through. */
  include: Set<string> | null;
  /** Any one of these rules a title out. */
  exclude: Set<string>;
};

export function malGenreFilter(query: DiscoverQuery): MalGenreFilter {
  const wanted = query.keyword
    ? (MAL_KEYWORDS[query.keyword] ?? [])
    : (query.genreIds ?? []).flatMap((id) => MAL_GENRES[id] ?? []);
  return {
    include: wanted.length > 0 ? new Set(wanted) : null,
    exclude: new Set(
      (query.excludeGenreIds ?? []).flatMap((id) => MAL_GENRES[id] ?? []),
    ),
  };
}

export function fitsMalGenres(
  anime: Pick<AnimeRef, "genres">,
  filter: MalGenreFilter,
): boolean {
  if (anime.genres.some((genre) => filter.exclude.has(genre))) return false;
  return (
    !filter.include || anime.genres.some((genre) => filter.include!.has(genre))
  );
}

/**
 * The shelf under a title: what members recommend first, then the provider's
 * own list to fill it. Two recommendations can land on one TMDB title, a
 * sequel on the show it continues, and the title itself is never suggested.
 */
export function mergeSimilar(
  seed: Pick<MediaSummary, "kind" | "providerId">,
  primary: MediaSummary[],
  fallback: MediaSummary[],
  size: number,
): MediaSummary[] {
  const seen = new Set([`${seed.kind}:${seed.providerId}`]);
  const out: MediaSummary[] = [];
  for (const item of [...primary, ...fallback]) {
    const key = `${item.kind}:${item.providerId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= size) break;
  }
  return out;
}

function yearOf(date: string | null | undefined): number | null {
  const match = date?.match(/^(\d{4})/);
  return match ? Number(match[1]) : null;
}
