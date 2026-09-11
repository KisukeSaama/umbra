/**
 * Formatting shared by the server and the browser.
 *
 * These live outside `src/lib/domain` on purpose: a client component that only
 * needs to print an amount must not pull a module that opens a database
 * connection.
 */

const BYTE_UNITS = {
  en: ["B", "KB", "MB", "GB", "TB", "PB"],
  fr: ["o", "Ko", "Mo", "Go", "To", "Po"],
} as const;

/** Short form, sized for public display: one decimal at most. */
export function formatBytes(bytes: number, locale: "en" | "fr" = "en"): string {
  const units = BYTE_UNITS[locale] ?? BYTE_UNITS.en;
  if (!Number.isFinite(bytes) || bytes <= 0) return `0 ${units[0]}`;

  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1000)),
    units.length - 1,
  );
  const value = bytes / 1000 ** exponent;
  const rounded =
    value >= 100 || exponent === 0
      ? Math.round(value)
      : Math.round(value * 10) / 10;

  return `${rounded.toLocaleString(locale === "fr" ? "fr-FR" : "en-US")} ${units[exponent]}`;
}

/** `S02E09` */
export function formatEpisodeCode(season: number, episode: number) {
  return `S${String(season).padStart(2, "0")}E${String(episode).padStart(2, "0")}`;
}

/** Runs of episodes as an indexer is searched: `S01E02-S01E05, S01E09`. */
export function formatEpisodeRuns(
  season: number,
  runs: readonly (readonly [number, number])[],
) {
  return runs
    .map(([from, to]) =>
      from === to
        ? formatEpisodeCode(season, from)
        : `${formatEpisodeCode(season, from)}-${formatEpisodeCode(season, to)}`,
    )
    .join(", ");
}

type DateLocale = "en" | "fr";

const LOCALE_TAGS: Record<DateLocale, string> = { en: "en-US", fr: "fr-FR" };

/**
 * A date-only string (`2026-09-09`) is pinned to noon UTC before it becomes a
 * `Date`, so no timezone west or east of Greenwich shifts it to the wrong day.
 */
export function toDate(value: Date | string): Date {
  return typeof value === "string" ? new Date(`${value}T12:00:00Z`) : value;
}

/**
 * Today, as a date-only key: `2026-09-09`.
 *
 * The one calendar everything is judged against. The database asks
 * `air_date <= CURRENT_DATE`, which is the day where the server stands, so a
 * page that compared an air date with an instant instead read a different day
 * for part of every day: the calendar said an episode had aired and raised a
 * task for it while the page still called it scheduled. Both sides now ask the
 * same question of the same clock.
 */
export function dayKey(value: Date = new Date()): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** `9 Sept 2026`, or the long month when the date is the point of the line. */
export function formatDate(
  value: Date | string,
  locale: DateLocale = "en",
  month: "short" | "long" = "short",
): string {
  return new Intl.DateTimeFormat(LOCALE_TAGS[locale], {
    day: "numeric",
    month,
    year: "numeric",
  }).format(toDate(value));
}

/** `9 Sept 2026, 10:23`: job runs and history entries. */
export function formatDateTime(value: Date, locale: DateLocale = "en"): string {
  return new Intl.DateTimeFormat(LOCALE_TAGS[locale], {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

/** `Tue 9 Sept`: a broadcast day, close enough not to need its year. */
export function formatAirDate(
  value: Date | string,
  locale: DateLocale = "en",
): string {
  return new Intl.DateTimeFormat(LOCALE_TAGS[locale], {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(toDate(value));
}
