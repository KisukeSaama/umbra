import { Skeleton } from "@/components/ui/skeleton";
import { LoadingRegion, TextLine } from "@/components/skeletons";
import { getTranslator } from "@/lib/i18n/server";

/**
 * The news feed before it is read: the title, the front page on its sheet,
 * then a few journal entries in the shape they will take, gutter and rail
 * included, so nothing jumps when the notes arrive.
 */
export default async function NewsLoading() {
  const t = await getTranslator();

  return (
    <LoadingRegion
      label={t("common.loading")}
      className="umbra-container py-8 sm:py-12"
    >
      <div className="mb-10 sm:mb-12">
        <TextLine size="xs" className="mb-3 w-44" />
        <TextLine size="h1" className="w-48" />
        <TextLine size="base" className="mt-2 w-72 max-w-full" />
      </div>

      <div className="bg-card ring-foreground/10 grid overflow-hidden rounded-2xl ring-1 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6 p-6 sm:p-8">
          <div className="flex items-center gap-3">
            <Skeleton className="size-9 shrink-0 rounded-lg" />
            <TextLine size="sm" className="w-28" />
          </div>
          <TextLine size="h2" className="w-3/4 max-w-xl" />
          <div className="max-w-prose">
            {[0, 1, 2, 3].map((line) => (
              <TextLine
                key={line}
                size="base"
                className={line === 3 ? "w-1/2" : "w-full"}
              />
            ))}
          </div>
        </div>
        <div className="border-border/60 bg-secondary/40 space-y-6 border-t p-6 sm:p-8 lg:border-t-0 lg:border-l">
          <Skeleton className="hidden h-14 w-16 rounded-lg lg:block" />
          <Skeleton className="h-9 w-24 rounded-lg" />
        </div>
      </div>

      <div className="mt-14 sm:mt-20">
        <TextLine size="h2" className="mb-2 w-28" />
        <div className="divide-border/60 border-border/60 divide-y border-y">
          {[3, 2].map((lines, index) => (
            <div
              key={index}
              className="grid gap-x-10 gap-y-5 py-10 sm:grid-cols-[8rem_minmax(0,1fr)] lg:grid-cols-[9rem_minmax(0,1fr)_16rem]"
            >
              <div className="space-y-5">
                <Skeleton className="hidden h-10 w-12 rounded-lg sm:block" />
                <div className="flex items-center gap-3">
                  <Skeleton className="size-9 shrink-0 rounded-lg sm:size-8" />
                  <TextLine size="sm" className="w-20" />
                </div>
              </div>
              <div className="min-w-0">
                <TextLine size="base" className="w-2/3" />
                <div className="mt-4 max-w-prose">
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
      </div>
    </LoadingRegion>
  );
}
