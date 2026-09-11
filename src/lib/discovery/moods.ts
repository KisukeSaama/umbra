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
export const VISUAL_STYLES = ["anime", "cartoon", "live"] as const;
export type VisualStyle = (typeof VISUAL_STYLES)[number];
export const FORMATS = ["movie", "series", "either"] as const;
export type Format = (typeof FORMATS)[number];
export const DURATIONS = ["short", "any"] as const;
export type Duration = (typeof DURATIONS)[number];
export const COMMITMENTS = ["short", "long", "any"] as const;
export type Commitment = (typeof COMMITMENTS)[number];
export const ERAS = ["classic", "modern", "recent", "any"] as const;
export type Era = (typeof ERAS)[number];
export const ORIGINS = ["french", "world", "any"] as const;
export type Origin = (typeof ORIGINS)[number];

/** The years of first release each era covers, both ends included. */
const ERA_YEARS: Record<
  Era,
  Pick<DiscoverQuery, "releasedFrom" | "releasedTo">
> = {
  classic: { releasedTo: 1979 },
  modern: { releasedFrom: 1980, releasedTo: 2009 },
  recent: { releasedFrom: 2010 },
  any: {},
};

export function eraYears(era: Era) {
  return ERA_YEARS[era];
}
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
  moods: Mood[];
  visualStyles: VisualStyle[];
  format: Format;
  duration: Duration;
  commitment?: Commitment;
  era?: Era;
  origin?: Origin;
};
export function isMood(raw: unknown): raw is Mood {
  return MOODS.includes(raw as Mood);
}
export function isVisualStyle(raw: unknown): raw is VisualStyle {
  return VISUAL_STYLES.includes(raw as VisualStyle);
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
    releaseDate?: string | null;
  },
  query: DiscoverQuery,
): boolean {
  if (!releasedWithin(item.releaseDate, query)) return false;
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
  if (query.excludeOriginalLanguages?.includes(item.originalLanguage ?? ""))
    return false;
  return true;
}

export function discoverQueriesFor(choice: PickerChoice): DiscoverQuery[] {
  const moods = choice.moods.includes("any") ? ["any" as const] : choice.moods;
  const styles =
    choice.visualStyles.length === VISUAL_STYLES.length
      ? [null]
      : choice.visualStyles;

  return kindsFor(choice.format).flatMap((kind) => {
    const genreIds = [
      ...new Set(moods.flatMap((mood) => genresFor(mood, kind))),
    ];
    const excluded = [
      ...new Set(moods.flatMap((mood) => excludedGenresFor(mood, kind))),
    ];

    return styles.map((style) => ({
      kind,
      genreIds,
      excludeGenreIds: [
        ...excluded,
        ...(style === "live" ? [ANIMATION_GENRE_ID] : []),
      ],
      ...(style === "anime" || style === "cartoon"
        ? { requireGenreIds: [ANIMATION_GENRE_ID] }
        : {}),
      ...languagesFor(style, choice.origin ?? "any"),
      ...eraYears(choice.era ?? "any"),
      ...(kind === "tv" &&
      moods.length === 1 &&
      (moods[0] === "horror" || moods[0] === "love")
        ? {
            keyword: moods[0] === "horror" ? "horror" : "romance",
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
  });
}

/**
 * The original languages a style and an origin ask for together. An anime
 * already says where it was made, so the origin has nothing to add to it.
 */
function languagesFor(
  style: VisualStyle | null,
  origin: Origin,
): Pick<DiscoverQuery, "originalLanguage" | "excludeOriginalLanguages"> {
  if (style === "anime") return { originalLanguage: "ja" };
  const refused = [
    ...(style === "cartoon" ? ["ja"] : []),
    ...(origin === "world" ? ["en"] : []),
  ];
  return {
    ...(origin === "french" ? { originalLanguage: "fr" } : {}),
    ...(refused.length > 0 ? { excludeOriginalLanguages: refused } : {}),
  };
}

/**
 * Whether a first release falls inside the years a query asks for. With an
 * era asked, an unknown date does not qualify, like an unknown runtime.
 */
export function releasedWithin(
  releaseDate: string | null | undefined,
  query: Pick<DiscoverQuery, "releasedFrom" | "releasedTo">,
): boolean {
  if (query.releasedFrom === undefined && query.releasedTo === undefined)
    return true;
  const year = Number.parseInt(releaseDate?.slice(0, 4) ?? "", 10);
  if (!Number.isFinite(year)) return false;
  return (
    (query.releasedFrom === undefined || year >= query.releasedFrom) &&
    (query.releasedTo === undefined || year <= query.releasedTo)
  );
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
