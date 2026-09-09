import type { NotificationKind, NotificationPayload } from "@/lib/db/schema";
import type { TranslationKey, Translator } from "@/lib/i18n";

/**
 * One notification, turned into a sentence.
 *
 * Nothing is stored as words: an entry carries a kind and a little structured
 * payload, and the wording is resolved here, in the language of whoever is
 * reading. The bell and the follow-up page share this so the same entry never
 * reads two different ways.
 *
 * A status the interface has no wording for falls back to the title alone
 * rather than to a blank line: an entry nobody planned for is still worth
 * seeing.
 */
export function notificationLine(
  t: Translator,
  entry: { kind: NotificationKind; payload: NotificationPayload },
): string {
  const title = entry.payload.title ?? "";

  if (entry.kind === "request_status" || entry.kind === "report_status") {
    const prefix = entry.kind === "request_status" ? "request" : "report";
    const key = `notifications.${prefix}.${entry.payload.status}`;
    const translated = t(key as TranslationKey, { title });
    return translated === key ? title : translated;
  }
  if (entry.kind === "announcement")
    return t("notifications.announcement", { title });
  if (entry.kind === "poll_open") return t("notifications.poll", { title });
  return t("notifications.episode", { title });
}
