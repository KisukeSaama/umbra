import { redirect } from "next/navigation";

/**
 * Requesting is no longer a page of its own: it happens from a title, and a
 * title is reached from the shelves or from the search palette. A query string
 * is carried across so an old bookmark still lands on something useful.
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
