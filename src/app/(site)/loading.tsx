import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shown while a member page is still reading. Same gutter and same rhythm as
 * the page that replaces it, so nothing jumps when the content lands.
 */
export default function SiteLoading() {
  return (
    <div className="umbra-container max-w-3xl py-12" aria-busy="true">
      <Skeleton className="h-9 w-56" />
      <Skeleton className="mt-3 h-4 w-72" />
      <div className="mt-8 space-y-3">
        {[0, 1, 2].map((index) => (
          <div
            key={index}
            className="border-border/60 flex gap-4 rounded-xl border p-3 sm:p-4"
          >
            <Skeleton className="aspect-[2/3] w-20 shrink-0 rounded-lg sm:w-24" />
            <div className="flex-1 space-y-2 py-1">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
