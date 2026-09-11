import type { ReactNode } from "react";

import { Poster } from "@/components/poster";

/**
 * The surface a queue is drawn on: one card, rows divided by hairlines.
 *
 * A card per row was twenty rings on a screen, each as heavy as the next, and a
 * long queue read as a wall. One surface with dividers reads as a list, which
 * is what it is.
 */
export function QueueList({ children }: { children: ReactNode }) {
  return (
    <ul className="bg-card ring-foreground/10 divide-border/60 divide-y overflow-hidden rounded-xl ring-1">
      {children}
    </ul>
  );
}

/**
 * One row of an administration queue, whichever table it came from.
 *
 * What the row is about on the left, what can be done with it on the right, so
 * the buttons of every row line up in one column the eye runs down instead of
 * sitting under titles of every length. Below the large breakpoint there is no
 * room for two columns and the buttons go under the text, as before.
 */
export function QueueRow({
  poster,
  heading,
  detail,
  meta,
  note,
  footnote,
  actions,
}: {
  poster: { src: string | null; alt: string };
  /** The title and its chips, on one line that wraps. */
  heading: ReactNode;
  /** What was asked or reported, when the row says it. */
  detail?: ReactNode;
  /** Date, who is waiting, identifiers. */
  meta: ReactNode;
  /** The word left for the members, if any. */
  note?: string | null;
  footnote?: ReactNode;
  actions: ReactNode;
}) {
  return (
    <li className="flex gap-3 p-3 sm:gap-4 sm:px-4">
      <div className="w-10 shrink-0 sm:w-12">
        <Poster src={poster.src} alt={poster.alt} sizes="3rem" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2 lg:flex-row lg:items-center lg:gap-6">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            {heading}
          </div>
          {detail ? <p className="text-sm">{detail}</p> : null}
          <p className="text-muted-foreground text-xs">{meta}</p>
          {note ? (
            <p className="bg-secondary/40 text-muted-foreground rounded-lg px-3 py-1.5 text-sm">
              {note}
            </p>
          ) : null}
          {footnote ? (
            <p className="text-muted-foreground text-xs">{footnote}</p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2 empty:hidden lg:shrink-0 lg:justify-end">
          {actions}
        </div>
      </div>
    </li>
  );
}
