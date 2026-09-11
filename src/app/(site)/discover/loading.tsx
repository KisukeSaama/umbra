import { Skeleton } from "@/components/ui/skeleton";
import {
  LoadingRegion,
  PageHeaderSkeleton,
  ShelfSkeleton,
  TextLine,
} from "@/components/skeletons";
import { getTranslator } from "@/lib/i18n/server";

/**
 * The discover page before its shelves: the header, the picker's frame with
 * its first row of answers, then one rail per shelf the page streams. The
 * picker is not drawn for real here, although it needs no data: an answer
 * given to a placeholder would be lost when the page replaced it.
 */
export default async function DiscoverLoading() {
  const t = await getTranslator();

  return (
    <LoadingRegion
      label={t("common.loading")}
      className="umbra-container space-y-10 py-8 sm:space-y-12 sm:py-12"
    >
      <PageHeaderSkeleton />

      <div className="border-border/60 bg-card/40 rounded-xl border p-4 sm:p-6">
        <TextLine size="h2" className="mb-1 w-48 max-w-full" />
        <TextLine size="sm" className="mb-5 w-64 max-w-full" />
        <TextLine size="sm" className="mb-3 w-40" />
        <div className="flex flex-wrap gap-2">
          {["w-24", "w-20", "w-28", "w-24", "w-20"].map((width, index) => (
            <Skeleton key={index} className={`h-8 rounded-full ${width}`} />
          ))}
        </div>
      </div>

      <ShelfSkeleton />
      <ShelfSkeleton />
      <ShelfSkeleton />
    </LoadingRegion>
  );
}
