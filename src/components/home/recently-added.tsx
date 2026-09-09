import { Poster } from "@/components/poster";
import { SectionHeading } from "@/components/section";
import type { RecentItem } from "@/lib/domain/library";
import { getTranslator } from "@/lib/i18n/server";

/**
 * The reason to come back when nothing is being requested: what landed on the
 * server lately, as a poster rail rather than a copy of the server's own UI.
 */
export async function RecentlyAdded({ items }: { items: RecentItem[] }) {
  const t = await getTranslator();
  if (items.length === 0) return null;

  return (
    <section>
      <SectionHeading title={t("section.recentlyAdded")} />
      {/* A rail on small screens, a grid once there is room: the same cards either way. */}
      <ul className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-4 sm:overflow-visible sm:px-0 lg:grid-cols-6">
        {items.map((item) => (
          <li
            key={item.ratingKey}
            className="group w-32 shrink-0 snap-start sm:w-auto"
          >
            <Poster src={item.posterUrl} alt={item.title} />
            <p className="mt-2 truncate text-sm font-medium" title={item.title}>
              {item.title}
            </p>
            <p className="text-muted-foreground text-xs">
              {item.kind === "movie" ? t("common.movie") : t("common.series")}
              {item.year ? ` - ${item.year}` : ""}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
