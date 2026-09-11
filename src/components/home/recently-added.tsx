import { formatPosterScore } from "@/components/formatting";
import { Rail } from "@/components/rail";
import { Poster } from "@/components/poster";
import { SectionHeading } from "@/components/section";
import { TitleCard } from "@/components/title-card";
import type { RecentItem } from "@/lib/domain/library";
import { getI18n } from "@/lib/i18n/server";

/**
 * The reason to come back when nothing is being requested: what landed on the
 * server lately, as a poster rail rather than a copy of the server's own UI.
 *
 * An entry the media server never matched to a provider id has no page to open,
 * so it stays a poster rather than becoming a link that goes nowhere, and it
 * does not lift on hover either: nothing promises a click it cannot keep.
 */
export async function RecentlyAdded({ items }: { items: RecentItem[] }) {
  const { t, locale } = await getI18n();
  if (items.length === 0) return null;

  return (
    <section>
      <SectionHeading title={t("section.recentlyAdded")} href="/discover" />
      <Rail name="recently-added">
        {items.map((item, index) => (
          <div
            key={item.ratingKey}
            className="w-32 shrink-0 snap-start sm:w-36"
          >
            {item.providerId ? (
              <TitleCard
                kind={item.kind === "movie" ? "movie" : "tv"}
                providerId={item.providerId}
                title={item.title}
                year={item.year}
                posterUrl={item.posterUrl}
                voteAverage={item.voteAverage}
                voteCount={item.voteCount}
                availability="available"
                preload={index < 4}
              />
            ) : (
              <div>
                <Poster
                  src={item.posterUrl}
                  alt={item.title}
                  captioned
                  sizes="10rem"
                  preload={index < 4}
                  ratingLabel={formatPosterScore(
                    item.voteAverage,
                    item.voteCount,
                    locale,
                  )}
                />
                <p className="mt-2 truncate text-sm font-medium">
                  {item.title}
                </p>
                <p className="text-muted-foreground text-xs">
                  {item.kind === "movie"
                    ? t("common.movie")
                    : t("common.series")}
                  {item.year ? ` · ${item.year}` : ""}
                </p>
              </div>
            )}
          </div>
        ))}
      </Rail>
    </section>
  );
}
