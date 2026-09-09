import type { DiscoverQuery, MediaKind } from "@/lib/providers/metadata";

/**
 * The guided picker, expressed as data.
 *
 * Three closed questions, and no way for a member to type anything: this is
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
  "anime",
] as const;
export type Mood = (typeof MOODS)[number];

export const FORMATS = ["movie", "series", "either"] as const;
export type Format = (typeof FORMATS)[number];

export const DURATIONS = ["short", "any"] as const;
export type Duration = (typeof DURATIONS)[number];

/** A film under this runs before the evening is gone. */
export const SHORT_RUNTIME_MINUTES = 100;

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
  /**
   * Original language, when the mood is about an origin rather than a genre.
   * Animation is a technique and "anime" is not: without this, the shelf comes
   * back led by Pixar and DC.
   */
  originalLanguage?: string;
};

const MOOD_GENRES = {
  // Horror, Thriller, Mystery / Mystery, Crime. Comedy and Family are out:
  // a horror parody is not what someone asking to be scared meant.
  thrill: {
    movie: { include: [27, 53, 9648], exclude: [35, 10751, 16, 99] },
    tv: { include: [9648, 80], exclude: [35, 10751, 16, 10762, 99] },
  },
  // Comedy on both sides, minus everything that makes a comedy heavy. Horror
  // is refused on the film side only: TMDB does not file shows under it, and
  // an exclusion aimed at a genre that does not exist filters nothing.
  // Action and Adventure is out of the show side because otherwise the whole
  // shelf is shonen, which the anime mood already answers better.
  laugh: {
    movie: { include: [35], exclude: [27, 53, 99, 10752, 36] },
    tv: { include: [35], exclude: [99, 10768, 10767, 10759] },
  },
  // Adventure, Action, Fantasy / Action and Adventure. Animation is excluded
  // on purpose: it has its own mood, and left in it wins every shelf.
  adventure: {
    movie: { include: [12, 28, 14], exclude: [99, 27, 10402, 16] },
    tv: { include: [10759], exclude: [99, 10767, 16] },
  },
  // Romance, on its own. Drama used to be included here and it is what made
  // this mood return The Godfather. TMDB has no Romance genre for shows, so
  // that side is Drama and Soap with the loud genres taken back out.
  love: {
    movie: { include: [10749], exclude: [27, 99, 10752] },
    tv: {
      include: [18, 10766],
      exclude: [10759, 10765, 99, 80, 16, 10762, 10768],
    },
  },
  // Science Fiction and Documentary / Sci-Fi and Fantasy, Documentary. Mystery
  // is deliberately not here: it belongs to thrill, and sharing it made the two
  // moods return the same Hitchcock films.
  brain: {
    movie: { include: [878, 99], exclude: [16, 10751, 35, 10402] },
    tv: { include: [10765, 99], exclude: [16, 10751, 35, 10762, 10759] },
  },
  // Family and Animation. Comedy stays on the film side, where it reads as
  // feel-good, and comes off the show side where it made this mood a copy of
  // laugh. Action and horror are out: an animated war epic is not comfort.
  comfort: {
    movie: {
      include: [10751, 35, 16],
      exclude: [27, 53, 80, 10752, 9648, 28],
    },
    tv: {
      include: [10751, 16],
      exclude: [80, 9648, 10768, 10767, 10759],
    },
  },
  // Animation, made in Japan.
  anime: {
    movie: { include: [16], exclude: [] },
    tv: { include: [16], exclude: [] },
    originalLanguage: "ja",
  },
} satisfies Record<Mood, MoodSpec>;

export type PickerChoice = {
  mood: Mood;
  format: Format;
  duration: Duration;
};

export function isMood(raw: unknown): raw is Mood {
  return MOODS.includes(raw as Mood);
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

export function originalLanguageFor(mood: Mood): string | undefined {
  return (MOOD_GENRES[mood] as MoodSpec).originalLanguage;
}

/**
 * One query per kind the answer covers.
 *
 * The runtime ceiling is only ever attached to a film: on a show the same
 * parameter filters the length of one episode, which is a different question,
 * and silently narrows the shelf to almost nothing.
 */
export function discoverQueriesFor(choice: PickerChoice): DiscoverQuery[] {
  return kindsFor(choice.format).map((kind) => ({
    kind,
    genreIds: genresFor(choice.mood, kind),
    excludeGenreIds: excludedGenresFor(choice.mood, kind),
    originalLanguage: originalLanguageFor(choice.mood),
    sortBy: "rating" as const,
    ...(choice.duration === "short" && kind === "movie"
      ? { runtimeLte: SHORT_RUNTIME_MINUTES }
      : {}),
  }));
}
