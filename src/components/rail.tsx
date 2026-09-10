"use client";

import { useEffect, useRef, useState } from "react";

import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { useTranslator } from "@/lib/i18n/client";

/**
 * A horizontal run of cards.
 *
 * It scrolls with a finger on a phone and with two real buttons from the medium
 * breakpoint up. The buttons are not decoration: the rails hide their scrollbar,
 * and a hidden scrollbar with no other affordance leaves a keyboard or a
 * trackpad-less mouse with nowhere to go. They disappear at the ends rather than
 * sitting there disabled, which is also what tells the eye there is more to the
 * side: the cards themselves are cut cleanly by the edge, never faded out.
 *
 * They say which way they go, and they are flat: a card surface on a hairline
 * ring, like everything else at rest. They were named "Back" and "View all",
 * which is what happens when a control borrows a wording instead of asking for
 * one.
 */
export function Rail({ children }: { children: React.ReactNode }) {
  const track = useRef<HTMLDivElement>(null);
  const t = useTranslator();
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);

  useEffect(() => {
    const node = track.current;
    if (!node) return;

    const measure = () => {
      setAtStart(node.scrollLeft < 8);
      setAtEnd(node.scrollLeft + node.clientWidth >= node.scrollWidth - 8);
    };

    measure();
    node.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => {
      node.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, []);

  function nudge(direction: -1 | 1) {
    const node = track.current;
    if (!node) return;
    node.scrollBy({
      left: direction * Math.round(node.clientWidth * 0.8),
      behavior: "smooth",
    });
  }

  return (
    <div className="group/rail relative">
      <div
        ref={track}
        className="umbra-rail -mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0"
      >
        {children}
      </div>

      {atStart ? null : (
        <Button
          type="button"
          variant="secondary"
          size="icon-sm"
          aria-label={t("rail.scrollLeft")}
          onClick={() => nudge(-1)}
          className="bg-card ring-foreground/10 absolute top-1/3 -left-3 hidden rounded-full ring-1 md:flex"
        >
          <ChevronLeftIcon />
        </Button>
      )}
      {atEnd ? null : (
        <Button
          type="button"
          variant="secondary"
          size="icon-sm"
          aria-label={t("rail.scrollRight")}
          onClick={() => nudge(1)}
          className="bg-card ring-foreground/10 absolute top-1/3 -right-3 hidden rounded-full ring-1 md:flex"
        >
          <ChevronRightIcon />
        </Button>
      )}
    </div>
  );
}
