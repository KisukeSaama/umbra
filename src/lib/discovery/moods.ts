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
 */
type MoodSpec = { movie: number[]; tv: number[] };

const MOOD_GENRES = {
  // Horror, Thriller, Mystery / Mystery, Crime.
  thrill: { movie: [27, 53, 9648], tv: [9648, 80] },
  // Comedy on both sides.
  laugh: { movie: [35], tv: [35] },
  // Adventure, Action, Fantasy / Action and Adventure, Sci-Fi and Fantasy.
  adventure: { movie: [12, 28, 14], tv: [10759, 10765] },
  // Romance, Drama / Drama, Soap.
  love: { movie: [10749, 18], tv: [18, 10766] },
  // Science Fiction, Mystery, Documentary / Sci-Fi and Fantasy, Documentary.
  brain: { movie: [878, 9648, 99], tv: [10765, 99] },
  // Family, Animation, Comedy on both sides.
  comfort: { movie: [10751, 16, 35], tv: [10751, 16, 35] },
  // Animation on both sides.
  anime: { movie: [16], tv: [16] },
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
  return MOOD_GENRES[mood][kind];
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
    sortBy: "rating" as const,
    ...(choice.duration === "short" && kind === "movie"
      ? { runtimeLte: SHORT_RUNTIME_MINUTES }
      : {}),
  }));
}
