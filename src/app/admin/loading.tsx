import { Skeleton } from "@/components/ui/skeleton";

/** The admin column while a section is still reading from the database. */
export default function AdminLoading() {
  return (
    <div className="space-y-8" aria-busy="true">
      <div className="bg-card ring-foreground/10 space-y-4 rounded-xl p-4 ring-1">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
      </div>
      <div className="divide-border/60 divide-y">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="flex items-center gap-3 py-3">
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-1/4" />
            </div>
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
