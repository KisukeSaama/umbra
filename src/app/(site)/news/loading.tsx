import { Skeleton } from "@/components/ui/skeleton";
import { LoadingRegion, TextLine } from "@/components/skeletons";
import { getTranslator } from "@/lib/i18n/server";

/**
 * The news feed before it is read: a title, then a few entries in the shape
 * they will take, gutter included, so nothing jumps when the notes arrive.
 */
export default async function NewsLoading() {
  const t = await getTranslator();

  return (
    <LoadingRegion
      label={t("common.loading")}
      className="umbra-container max-w-3xl py-12"
    >
      <div className="mb-10">
        <TextLine size="h1" className="w-40" />
        <TextLine size="base" className="mt-1 w-72 max-w-full" />
      </div>

      <div className="border-border/60 border-t">
        {[3, 2, 4].map((lines, index) => (
          <div
            key={index}
            className="border-border/60 grid gap-x-8 gap-y-4 border-b py-8 sm:grid-cols-[7.5rem_minmax(0,1fr)]"
          >
            <div className="flex items-center gap-3 sm:block">
              <Skeleton className="size-9 shrink-0 rounded-lg" />
              <div className="min-w-0 sm:mt-3">
                <TextLine size="sm" className="w-20" />
                <TextLine size="xs" className="mt-0.5 w-16" />
              </div>
            </div>

            <div className="min-w-0">
              <TextLine size="base" className="w-2/3" />
              <div className="mt-4">
                {Array.from({ length: lines }, (_, line) => (
                  <TextLine
                    key={line}
                    size="sm"
                    className={line === lines - 1 ? "w-2/3" : "w-full"}
                  />
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </LoadingRegion>
  );
}
