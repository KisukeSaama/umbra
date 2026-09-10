import type { Translator } from "@/lib/i18n";

/**
 * Durations, in the reader's language.
 *
 * Two screens report how long the machine took, and both used to build the
 * answer out of a number and a hard-coded symbol. The symbol is not the same
 * word everywhere and French sets a no-break space in front of it, so the
 * assembly belongs to the dictionary: `unit.*` carries the punctuation and
 * these two only decide which unit the figure deserves.
 *
 * Neither rounds up to an hour. A step that takes one is a step in trouble,
 * and the page above says that in its own way.
 */

/** What a job run took: milliseconds under a second, then seconds, then minutes. */
export function formatDuration(ms: number, t: Translator): string {
  if (ms < 1000) return t("unit.milliseconds", { value: Math.round(ms) });
  if (ms < 60_000) return t("unit.seconds", { value: Math.round(ms / 1000) });
  return t("unit.minutes", { value: Math.round(ms / 60_000) });
}

/**
 * How long a walk has been running: seconds, then minutes and seconds.
 *
 * The seconds are kept past the minute, and padded, so the figure reads as a
 * clock that is still moving rather than as a number that stopped.
 */
export function formatElapsed(ms: number, t: Translator): string {
  const seconds = Math.floor(Math.max(0, ms) / 1000);
  if (seconds < 60) return t("unit.seconds", { value: seconds });
  return t("unit.minutesSeconds", {
    minutes: Math.floor(seconds / 60),
    seconds: String(seconds % 60).padStart(2, "0"),
  });
}
