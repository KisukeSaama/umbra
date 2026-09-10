import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getTranslator } from "@/lib/i18n/server";

/**
 * Polls moved into the news feed. The address stays alive because links to it
 * exist in people's history and in old announcements.
 *
 * It still names itself: the tab of a page that forwards is read for the
 * instant it exists, and "Umbra" alone said nothing about where it went.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslator();
  return { title: t("section.poll") };
}

export default function PollsPage() {
  redirect("/news");
}
