"use client";

import { useEffect, useState } from "react";

import { ChevronUpIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { cn } from "cn";
import { useTranslator } from "@/lib/i18n/client";

/** Roughly a screen: below that, the top is still in sight. */
const APPEARS_AFTER = 600;

/**
 * The way back up a long page.
 *
 * A title with ten seasons is a long scroll, and the header is the one thing
 * that is not in reach once you are deep in it. The button only exists after a
 * screen of scrolling, because before that it would be answering a question
 * nobody asked.
 */
export function BackToTop() {
  const t = useTranslator();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > APPEARS_AFTER);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <Button
      variant="outline"
      size="icon-lg"
      aria-label={t("common.backToTop")}
      // Hidden rather than removed, so it fades instead of appearing, and out
      // of the tab order and the screen reader while it is not there.
      aria-hidden={!visible}
      tabIndex={visible ? undefined : -1}
      className={cn(
        "fixed right-4 bottom-4 z-30 rounded-full transition-opacity sm:right-6 sm:bottom-6",
        visible ? "opacity-100" : "pointer-events-none opacity-0",
      )}
      onClick={() =>
        window.scrollTo({
          top: 0,
          // The stylesheet cannot reach a scroll asked for in script, so the
          // preference is read here too.
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? "auto"
            : "smooth",
        })
      }
    >
      <ChevronUpIcon />
    </Button>
  );
}
