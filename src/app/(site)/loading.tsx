import { Hero } from "@/components/home/hero";
import {
  CardSkeleton,
  LoadingRegion,
  ShelfSkeleton,
} from "@/components/skeletons";
import { getTranslator } from "@/lib/i18n/server";

/**
 * The home page while it is still reading.
 *
 * The hero needs no data beyond the poster wall behind it, so it is drawn for
 * real straight away: the front door is there before anything is fetched,
 * and only the weather behind the messenger arrives with the page. Below it,
 * the rail and the two rows of glances, in the frames they will fill.
 */
export default async function SiteLoading() {
  const t = await getTranslator();

  return (
    <>
      <Hero posters={[]} />
      <LoadingRegion
        label={t("common.loading")}
        className="umbra-container space-y-12 py-12"
      >
        <ShelfSkeleton />
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
            <CardSkeleton lines={3} />
            <CardSkeleton lines={2} />
          </div>
          <div className="grid gap-6 md:items-start lg:grid-cols-2">
            <CardSkeleton lines={2} />
            <CardSkeleton lines={2} />
          </div>
        </div>
      </LoadingRegion>
    </>
  );
}
