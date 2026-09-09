import { Skeleton } from "@/components/ui/skeleton";
import { CardSkeleton, LoadingRegion, TextLine } from "@/components/skeletons";
import { getTranslator } from "@/lib/i18n/server";

/**
 * The admin column while a section is still reading from the database: the
 * card most sections open with, then the rows of a queue. The shell above
 * already draws the heading and the sidebar, so this is content only.
 */
export default async function AdminLoading() {
  const t = await getTranslator();

  return (
    <LoadingRegion label={t("common.loading")} className="space-y-6">
      <CardSkeleton lines={2} />
      <div className="divide-border/60 divide-y">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="flex items-center gap-3 py-3">
            <div className="flex-1">
              <TextLine size="sm" className="w-1/3" />
              <TextLine size="xs" className="w-1/4" />
            </div>
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        ))}
      </div>
    </LoadingRegion>
  );
}
