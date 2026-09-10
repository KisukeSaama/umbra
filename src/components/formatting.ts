import type { Locale } from "@/lib/i18n";

/**
 * The two figures the interface writes out by hand.
 *
 * `@/lib/format` holds everything of this kind that the domain layer also
 * needs; these two are only ever wanted next to a component, and neither is
 * safe to build with string concatenation:
 *
 * A percentage is punctuated by the language. French puts a narrow no-break
 * space before the sign and English puts none, so `${percent}%` was wrong in
 * one of the two languages wherever it appeared.
 *
 * A number of days left is wall-clock arithmetic, and a client component doing
 * it computes one answer while the server is rendering and another a
 * millisecond later while hydrating. It is decided once, on the server, and
 * travels as a number.
 */

/** A ratio between zero and one, as a whole percentage in the reader's language. */
export function formatPercent(ratio: number, locale: Locale): string {
  return new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(ratio) ? ratio : 0);
}

/**
 * Whole days from now to a date, rounded up, or `null` when there is no date.
 * Zero and below mean the moment has passed.
 */
export function daysUntil(date: Date | null): number | null {
  if (!date) return null;
  return Math.ceil((date.getTime() - Date.now()) / 86_400_000);
}
