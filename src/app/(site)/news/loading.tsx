import { Skeleton } from "@/components/ui/skeleton";
import { LoadingRegion, TextLine } from "@/components/skeletons";
import { getTranslator } from "@/lib/i18n/server";

/** The news feed before it is read: a title, then a few announcement cards. */
export default async function NewsLoading() {
  const t = await getTranslator();

  return (
    <LoadingRegion
      label={t("common.loading")}
      className="umbra-container max-w-3xl py-12"
    >
      <TextLine size="h1" className="w-40" />
      <TextLine size="base" className="mt-1 mb-8 w-72 max-w-full" />

      <div className="space-y-4">
        {[3, 2, 3].map((lines, index) => (
          <div
            key={index}
            className="bg-card ring-foreground/10 rounded-xl p-4 ring-1"
          >
            <div className="flex items-start justify-between gap-4">
              <TextLine size="base" className="w-1/2" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <div className="mt-4">
              {Array.from({ length: lines }, (_, line) => (
                <TextLine
                  key={line}
                  size="sm"
                  className={line === lines - 1 ? "w-2/3" : "w-full"}
                />
              ))}
              <TextLine size="xs" className="mt-3 w-32" />
            </div>
          </div>
        ))}
      </div>
    </LoadingRegion>
  );
}
