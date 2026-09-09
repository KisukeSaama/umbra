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

/** An amount written the way the visitor's locale expects. */
export function formatAmount(
  cents: number,
  currency: string,
  locale: "en" | "fr" = "en",
) {
  return new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

/** `S02E09` */
export function formatEpisodeCode(season: number, episode: number) {
  return `S${String(season).padStart(2, "0")}E${String(episode).padStart(2, "0")}`;
}
