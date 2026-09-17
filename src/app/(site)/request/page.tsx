import { redirect } from "next/navigation";

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
