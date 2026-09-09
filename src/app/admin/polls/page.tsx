import { redirect } from "next/navigation";

/**
 * Polls are announcements, so they are written and read where announcements
 * are. The address stays alive for the bookmarks that point at it.
 */
export default function AdminPollsPage() {
  redirect("/admin/announcements");
}
