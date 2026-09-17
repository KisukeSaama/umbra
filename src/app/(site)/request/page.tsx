import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getTranslator } from "@/lib/i18n/server";

/**
 * It names itself on the way past, as the polls address does: a page that
 * forwards is still a tab for the instant it exists, and "Umbra" alone said
 * nothing about where it was going.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslator();
  return { title: t("nav.discover") };
}

/**
 * Requesting is no longer a page of its own: it happens from a title, and a
 * title is reached from the shelves or from the search palette. A query string
 * is carried across, and the discover page opens the palette on it, so an old
 * bookmark lands on the search it asked for rather than on a page that ignores
 * half its own address.
 */
export default async function RequestPage({
  searchParams,
}: PageProps<"/request">) {
  const { q } = await searchParams;
  redirect(
    typeof q === "string" && q
      ? `/discover?q=${encodeURIComponent(q)}`
      : "/discover",
  );
}
