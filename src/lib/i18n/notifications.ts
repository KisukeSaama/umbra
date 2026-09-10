import type {
  NotificationKind,
  NotificationPayload,
  ReportReason,
} from "@/lib/db/schema";
import type { TranslationKey, Translator } from "@/lib/i18n";
import { isAsk } from "@/lib/reports/reasons";

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
    const key = `notifications.${prefixFor(entry)}.${entry.payload.status}`;
    const translated = t(key as TranslationKey, { title });
    return translated === key ? title : translated;
  }
  if (entry.kind === "announcement")
    return t("notifications.announcement", { title });
  if (entry.kind === "poll_open") return t("notifications.poll", { title });
  return t("notifications.episode", { title });
}

/**
 * An ask is filed as a report but was a request from the member's side, so it
 * is told in a request's words, as the follow-up page lists it.
 */
function prefixFor(entry: {
  kind: NotificationKind;
  payload: NotificationPayload;
}): "request" | "ask" | "report" {
  if (entry.kind === "request_status") return "request";
  const reason = entry.payload.reason as ReportReason | undefined;
  return reason && isAsk(reason) ? "ask" : "report";
}
