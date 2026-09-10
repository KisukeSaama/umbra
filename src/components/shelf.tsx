import { Rail } from "@/components/rail";
import { SectionHeading } from "@/components/section";
import { TitleCard } from "@/components/title-card";
import type { CatalogResult } from "@/lib/domain/catalog";

/**
 * A named run of titles.
 *
 * It removes itself when it has nothing, the way the week strip does: an empty
 * rail with a heading over it is worse than no rail, and a page made of shelves
 * would otherwise fill with polite emptiness the first week.
 */
export function Shelf({
  title,
  items,
  href,
  delayMs = 0,
  priority = false,
  size = "default",
}: {
  title: string;
  items: CatalogResult[];
  href?: string;
  /** Shelves arrive one after another rather than all at once. */
  delayMs?: number;
  priority?: boolean;
  /** Compact is for a rail that is a glance beside a fuller one. */
  size?: "default" | "compact";
}) {
  if (items.length === 0) return null;

  return (
    <section className="umbra-fade" style={{ animationDelay: `${delayMs}ms` }}>
      <SectionHeading title={title} href={href} />
      <Rail name={title}>
        {items.map((item, index) => (
          <div
            key={`${item.kind}:${item.providerId}`}
            className={
              size === "compact"
                ? "w-24 shrink-0 snap-start sm:w-28"
                : "w-32 shrink-0 snap-start sm:w-36"
            }
          >
            <TitleCard
              kind={item.kind}
              providerId={item.providerId}
              title={item.title}
              year={item.year}
              posterUrl={item.posterUrl}
              availability={item.availability}
              priority={priority && index < 4}
            />
          </div>
        ))}
      </Rail>
    </section>
  );
}
