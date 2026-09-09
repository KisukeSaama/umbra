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

type DateLocale = "en" | "fr";

const LOCALE_TAGS: Record<DateLocale, string> = { en: "en-US", fr: "fr-FR" };

/**
 * A date-only string (`2026-09-09`) is pinned to noon UTC before it becomes a
 * `Date`, so no timezone west or east of Greenwich shifts it to the wrong day.
 */
export function toDate(value: Date | string): Date {
  return typeof value === "string" ? new Date(`${value}T12:00:00Z`) : value;
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
