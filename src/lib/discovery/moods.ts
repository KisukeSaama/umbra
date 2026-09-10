import type {
  DiscoverQuery,
  MediaKind,
  SeriesDetails,
} from "@/lib/providers/metadata";

/** Closed answers shared by the interface, validation and recommendation rules. */
export const MOODS = [
  "laugh",
  "thrill",
  "horror",
  "adventure",
  "love",
  "brain",
  "drama",
  "any",
] as const;
export type Mood = (typeof MOODS)[number];
export const ANIME_STANCES = ["only", "without", "with"] as const;
export type AnimeStance = (typeof ANIME_STANCES)[number];
export const FORMATS = ["movie", "series", "either"] as const;
export type Format = (typeof FORMATS)[number];
export const DURATIONS = ["short", "any"] as const;
export type Duration = (typeof DURATIONS)[number];
export const COMMITMENTS = ["short", "long", "any"] as const;
export type Commitment = (typeof COMMITMENTS)[number];
export const SHORT_RUNTIME_MINUTES = 119;
export const ANIMATION_GENRE_ID = 16;

// TV uses broader categories than movies, including Sci-Fi & Fantasy.
const GENRES: Record<Mood, Record<MediaKind, number[]>> = {
  laugh: { movie: [35], tv: [35] },
  thrill: { movie: [53], tv: [9648, 80] },
  horror: { movie: [27], tv: [9648] },
  adventure: { movie: [12], tv: [10759] },
  love: { movie: [10749], tv: [18, 10766] },
  brain: { movie: [878], tv: [10765] },
  drama: { movie: [18], tv: [18] },
  any: { movie: [], tv: [] },
};
export type PickerChoice = {
  mood: Mood;
  anime: AnimeStance;
  format: Format;
  duration: Duration;
  commitment?: Commitment;
};
export function isMood(raw: unknown): raw is Mood {
  return MOODS.includes(raw as Mood);
}
export function isAnimeStance(raw: unknown): raw is AnimeStance {
  return ANIME_STANCES.includes(raw as AnimeStance);
}
export function isFormat(raw: unknown): raw is Format {
  return FORMATS.includes(raw as Format);
}
export function isDuration(raw: unknown): raw is Duration {
  return DURATIONS.includes(raw as Duration);
}
export function kindsFor(format: Format): MediaKind[] {
  return format === "movie"
    ? ["movie"]
    : format === "series"
      ? ["tv"]
      : ["movie", "tv"];
}
export function genresFor(mood: Mood, kind: MediaKind): number[] {
  return GENRES[mood][kind];
}
export function excludedGenresFor(mood: Mood, kind: MediaKind): number[] {
  if (mood === "laugh" && kind === "movie") return [27, 53];
  if (mood === "love" && kind === "tv") return [10759, 80, 99, 10768];
  return [];
}

export function matchesQuery(
  item: {
    kind: MediaKind;
    genreIds: number[];
    originalLanguage?: string | null;
  },
  query: DiscoverQuery,
): boolean {
  if (
    item.kind !== query.kind ||
    query.runtimeLte !== undefined ||
    query.keyword !== undefined
  )
    return false;
  const genres = new Set(item.genreIds);
  if (query.genreIds?.length && !query.genreIds.some((id) => genres.has(id)))
    return false;
  if (query.excludeGenreIds?.some((id) => genres.has(id))) return false;
  if (query.requireGenreIds?.some((id) => !genres.has(id))) return false;
  if (
    query.originalLanguage &&
    item.originalLanguage !== query.originalLanguage
  )
    return false;
  return true;
}

export function discoverQueriesFor(choice: PickerChoice): DiscoverQuery[] {
  return kindsFor(choice.format).map((kind) => ({
    kind,
    genreIds: genresFor(choice.mood, kind),
    excludeGenreIds: [
      ...excludedGenresFor(choice.mood, kind),
      ...(choice.anime === "without" ? [ANIMATION_GENRE_ID] : []),
    ],
    ...(choice.anime === "only"
      ? { requireGenreIds: [ANIMATION_GENRE_ID] }
      : {}),
    ...(kind === "tv" && (choice.mood === "horror" || choice.mood === "love")
      ? {
          keyword: choice.mood === "horror" ? "horror" : "romance",
          genreIds: [],
        }
      : {}),
    sortBy: "rating" as const,
    ...(kind === "tv" && choice.commitment === "short"
      ? { shortSeries: true }
      : {}),
    ...(choice.duration === "short" && kind === "movie"
      ? { runtimeLte: SHORT_RUNTIME_MINUTES }
      : {}),
  }));
}

/** Specials do not count as a season. Cancelled shows are never a complete short story. */
export function matchesCommitment(
  details: Pick<SeriesDetails, "status" | "inProduction" | "seasons">,
  commitment: Commitment,
): boolean {
  if (commitment === "any") return true;
  const seasons = details.seasons.filter((season) => season.seasonNumber > 0);
  if (commitment === "long") return seasons.length >= 2;
  const episodes = seasons.reduce(
    (sum, season) => sum + season.episodeCount,
    0,
  );
  return (
    details.status === "Ended" &&
    !details.inProduction &&
    seasons.length === 1 &&
    episodes > 0 &&
    episodes <= 10
  );
}
