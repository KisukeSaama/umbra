import type { DiscoverQuery, MediaKind } from "@/lib/providers/metadata";

/**
 * The guided picker, expressed as data.
 *
 * Four closed questions, and no way for a member to type anything: this is
 * what lets "I do not know what to watch" become a real answer without a search
 * box and without moderation. The module is a leaf on purpose, importing only a
 * type: it stays pure, so it is unit tested the way the parsers are.
 */

export const MOODS = [
  "thrill",
  "laugh",
  "adventure",
  "love",
  "brain",
  "comfort",
] as const;
export type Mood = (typeof MOODS)[number];

/**
 * Anime is not a mood.
 *
 * It used to be one, next to "a fright" and "a love story", and that made the
 * picker ask the wrong question: someone who wants a romance still has to say
 * whether they want it drawn. A mood is what a title is about, anime is how it
 * is made and where, so it gets its own axis and every mood can be asked for in
 * all three ways.
 */
export const ANIME_STANCES = ["without", "with", "only"] as const;
export type AnimeStance = (typeof ANIME_STANCES)[number];

export const FORMATS = ["movie", "series", "either"] as const;
export type Format = (typeof FORMATS)[number];

export const DURATIONS = ["short", "any"] as const;
export type Duration = (typeof DURATIONS)[number];

/** A film under this runs before the evening is gone. */
export const SHORT_RUNTIME_MINUTES = 100;

/** Animation, the same id on both sides of the provider for once. */
export const ANIMATION_GENRE_ID = 16;

/** Where anime is made. The genre alone answers with Pixar and DC. */
export const ANIME_LANGUAGE = "ja";

/**
 * Genre ids are not shared between the two sides of TMDB, and the difference is
 * silent: asking for 28 on a show returns nothing rather than an error. Every
 * mood therefore carries one list per kind.
 *
 * A mood is a pair of lists, not one. Asked with `include` alone the provider
 * matches any single genre on a title, and most good films carry four or five:
 * "make me laugh" answered with Schindler's List because that film is filed
 * under Drama, and "romance" answered with The Godfather for the same reason.
 * `exclude` is what turns a loose union into an actual mood, and it is the half
 * that has to be maintained: a mood that shares its whole shelf with another
 * mood is a mood the picker did not need to ask about.
 *
 * No mood mentions Animation, in either list. That decision belongs to the
 * anime question now, and a mood that also had an opinion about it would either
 * contradict the answer or silently narrow it.
 */
type KindSpec = {
  /** Any one of these is enough for a title to qualify. */
  include: number[];
  /** Any one of these disqualifies it, whatever else it carries. */
  exclude: number[];
};
type MoodSpec = {
  movie: KindSpec;
  tv: KindSpec;
};

const MOOD_GENRES = {
  // Horror, Thriller, Mystery / Mystery, Crime. Comedy and Family are out:
  // a horror parody is not what someone asking to be scared meant.
  thrill: {
    movie: { include: [27, 53, 9648], exclude: [35, 10751, 99] },
    tv: { include: [9648, 80], exclude: [35, 10751, 10762, 99] },
  },
  // Comedy on both sides, minus everything that makes a comedy heavy. Horror
  // is refused on the film side only: TMDB does not file shows under it, and
  // an exclusion aimed at a genre that does not exist filters nothing.
  laugh: {
    movie: { include: [35], exclude: [27, 53, 99, 10752, 36] },
    tv: { include: [35], exclude: [99, 10768, 10767] },
  },
  // Adventure, Action, Fantasy / Action and Adventure.
  adventure: {
    movie: { include: [12, 28, 14], exclude: [99, 27, 10402] },
    tv: { include: [10759], exclude: [99, 10767] },
  },
  // Romance, on its own. Drama used to be included here and it is what made
  // this mood return The Godfather. TMDB has no Romance genre for shows, so
  // that side is Drama and Soap with the loud genres taken back out.
  love: {
    movie: { include: [10749], exclude: [27, 99, 10752] },
    tv: {
      include: [18, 10766],
      exclude: [10759, 10765, 99, 80, 10762, 10768],
    },
  },
  // Science Fiction and Documentary / Sci-Fi and Fantasy, Documentary. Mystery
  // is deliberately not here: it belongs to thrill, and sharing it made the two
  // moods return the same Hitchcock films.
  brain: {
    movie: { include: [878, 99], exclude: [10751, 35, 10402] },
    tv: { include: [10765, 99], exclude: [10751, 35, 10762, 10759] },
  },
  // Family, plus Comedy on the film side where it reads as feel-good and off
  // the show side where it made this mood a copy of laugh. Action and horror
  // are out: a war epic is not comfort, drawn or not.
  comfort: {
    movie: {
      include: [10751, 35],
      exclude: [27, 53, 80, 10752, 9648, 28],
    },
    tv: {
      include: [10751],
      exclude: [80, 9648, 10768, 10767, 10759],
    },
  },
} satisfies Record<Mood, MoodSpec>;

export type PickerChoice = {
  mood: Mood;
  anime: AnimeStance;
  format: Format;
  duration: Duration;
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
  if (format === "movie") return ["movie"];
  if (format === "series") return ["tv"];
  return ["movie", "tv"];
}

export function genresFor(mood: Mood, kind: MediaKind): number[] {
  return MOOD_GENRES[mood][kind].include;
}

export function excludedGenresFor(mood: Mood, kind: MediaKind): number[] {
  return MOOD_GENRES[mood][kind].exclude;
}

/**
 * Whether a listing row answers a query, read on the row itself.
 *
 * The reading the provider applies to the same query: one included genre is
 * enough, one excluded genre disqualifies, every required genre must be there,
 * and the origin must match when one is asked for. This is what lets the picker
 * filter a ranking it already holds rather than ask for a listing. The runtime
 * is not on a row, so a query carrying one is not answered here at all.
 */
export function matchesQuery(
  item: {
    kind: MediaKind;
    genreIds: number[];
    originalLanguage?: string | null;
  },
  query: DiscoverQuery,
): boolean {
  if (item.kind !== query.kind || query.runtimeLte !== undefined) return false;
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

/**
 * One query per kind the answer covers.
 *
 * The runtime ceiling is only ever attached to a film: on a show the same
 * parameter filters the length of one episode, which is a different question,
 * and silently narrows the shelf to almost nothing.
 *
 * The anime answer is applied on top of the mood, never inside it. "Only"
 * demands Animation and pins the origin to Japan, because the genre on its own
 * answers with Pixar. "Without" refuses Animation: the provider can filter on a
 * language it wants but not on one it refuses, so the closest honest reading of
 * "no anime" is "nothing drawn". "With" adds nothing at all, which is the point
 * of it: the mood answers, drawn or filmed.
 */
export function discoverQueriesFor(choice: PickerChoice): DiscoverQuery[] {
  return kindsFor(choice.format).map((kind) => ({
    kind,
    genreIds: genresFor(choice.mood, kind),
    excludeGenreIds: [
      ...excludedGenresFor(choice.mood, kind),
      ...(choice.anime === "without" ? [ANIMATION_GENRE_ID] : []),
    ],
    ...(choice.anime === "only"
      ? {
          requireGenreIds: [ANIMATION_GENRE_ID],
          originalLanguage: ANIME_LANGUAGE,
        }
      : {}),
    sortBy: "rating" as const,
    ...(choice.duration === "short" && kind === "movie"
      ? { runtimeLte: SHORT_RUNTIME_MINUTES }
      : {}),
  }));
}
