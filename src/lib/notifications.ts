import type { NotificationKind } from "@/lib/db/schema";

/**
 * Where a notification leads.
 *
 * An entry already knows what it is about: a kind and the id of its subject.
 * That is enough to point at the page where the thing lives, so a member reads
 * the line and lands on it rather than going looking. The subject id doubles as
 * the anchor on the destination page, which is why announcements and polls both
 * land on the feed and still stop at the right entry.
 *
 * A kind with nowhere to go returns null and stays plain text: a line that
 * looks clickable and moves nowhere is worse than one that does not.
 * `episode_available` is one of those for now, because its subject is a library
 * row and the title pages are keyed by provider id.
 */
export function notificationHref(entry: {
  kind: NotificationKind;
  subjectId: string | null;
}): string | null {
  switch (entry.kind) {
    case "request_status":
    case "report_status":
      return entry.subjectId ? `/activity#${entry.subjectId}` : "/activity";
    case "announcement":
    case "poll_open":
      return entry.subjectId ? `/news#${entry.subjectId}` : "/news";
    default:
      return null;
  }
}
