import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Placeholders shaped like what is coming.
 *
 * A skeleton is a promise about layout: when the content lands, nothing should
 * move. So every bar here stands in a box the height of the text line it
 * replaces, and every block borrows the frame of the component it waits for,
 * gutter for gutter. The pieces are deliberately dumb, no hook and no
 * translation, so a route's loading file and a client component can both use
 * them.
 */

/** The text sizes used on the pages: the line box, and the bar drawn in it. */
const LINES = {
  xs: { box: "h-4", bar: "h-2.5" },
  sm: { box: "h-5", bar: "h-3" },
  base: { box: "h-6", bar: "h-3.5" },
  /** A section heading: text-lg, text-xl from the small breakpoint up. */
  h2: { box: "h-7", bar: "h-4.5" },
  /** A title heading: text-2xl leading-snug, text-3xl from the small breakpoint up. */
  title: { box: "h-8 sm:h-10", bar: "h-5 sm:h-6" },
  /** The serif page title: text-3xl, text-4xl from the small breakpoint up. */
  h1: { box: "h-9 sm:h-10", bar: "h-6 sm:h-7" },
} as const;

/**
 * One line of text that is not here yet. The width goes on the box, so the
 * bar can be a third of a column or all of it while the line keeps its height.
 */
export function TextLine({
  size = "sm",
  className,
}: {
  size?: keyof typeof LINES;
  className?: string;
}) {
  const line = LINES[size];
  return (
    <div className={cn("flex items-center", line.box, className)}>
      <Skeleton className={cn("w-full", line.bar)} />
    </div>
  );
}

/**
 * The wrapper every loading state sits in. A busy attribute on a div tells a
 * screen reader nothing; a status region with one word in it does.
 */
export function LoadingRegion({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/** The header every member page opens with: a serif line and a sentence under it. */
export function PageHeaderSkeleton() {
  return (
    <div>
      <TextLine size="h1" className="w-56 max-w-full" />
      <TextLine size="base" className="mt-1 w-72 max-w-full" />
    </div>
  );
}

/** A section heading with its rail of title cards, gutter and fade included. */
export function ShelfSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div>
      <TextLine size="h2" className="mb-4 w-40" />
      <div className="umbra-rail -mx-4 flex gap-4 overflow-hidden px-4 pb-2 sm:mx-0 sm:px-0">
        {Array.from({ length: count }, (_, index) => (
          <div key={index} className="w-32 shrink-0 sm:w-36">
            <Skeleton className="aspect-[2/3] w-full rounded-lg" />
            <TextLine size="sm" className="mt-2 w-3/4" />
            <TextLine size="xs" className="w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** A poster beside a title and two lines of detail: a request, a report, a queue entry. */
export function TitleRowSkeleton({
  poster = "w-16 sm:w-20",
}: {
  /** The poster column of the list this stands in for. */
  poster?: string;
}) {
  return (
    <div className="border-border/60 bg-card/40 flex gap-4 rounded-xl border p-3 sm:p-4">
      <Skeleton className={cn("aspect-[2/3] shrink-0 rounded-lg", poster)} />
      <div className="min-w-0 flex-1 space-y-2">
        <TextLine size="base" className="w-1/3" />
        <TextLine size="xs" className="w-2/3" />
        <TextLine size="xs" className="w-1/4" />
      </div>
    </div>
  );
}

/** A card with its title and a few lines of content, on the card's own ring. */
export function CardSkeleton({ lines = 2 }: { lines?: number }) {
  const widths = ["w-full", "w-5/6", "w-2/3"];
  return (
    <div className="bg-card ring-foreground/10 rounded-xl p-4 ring-1">
      <TextLine size="base" className="w-40 max-w-full" />
      <div className="mt-4 space-y-1">
        {Array.from({ length: lines }, (_, index) => (
          <TextLine
            key={index}
            size="sm"
            className={widths[index % widths.length]}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * A title before the provider has answered: the banner, the poster, the
 * heading and the paragraph, in the frame the title view draws them in. The
 * negative margins are the view's own, so the banner bleeds through the
 * container padding exactly as the real one will.
 */
export function TitleSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="-mx-4 -mb-2 h-36 rounded-none sm:-mx-6 sm:h-52" />
      <div className="flex flex-col gap-5 sm:flex-row">
        <Skeleton className="aspect-[2/3] w-32 shrink-0 rounded-lg sm:w-40" />
        <div className="min-w-0 flex-1 space-y-3">
          <TextLine size="title" className="w-2/3" />
          <div>
            <TextLine size="sm" className="w-full" />
            <TextLine size="sm" className="w-full" />
            <TextLine size="sm" className="w-3/4" />
          </div>
          <Skeleton className="h-8 w-36 rounded-lg" />
        </div>
      </div>
    </div>
  );
}
