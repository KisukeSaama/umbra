import { redirect } from "next/navigation";

/**
 * Polls moved into the news feed. The address stays alive because links to it
 * exist in people's history and in old announcements.
 */
export default function PollsPage() {
  redirect("/news");
}
