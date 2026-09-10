"use client";

import { useEffect, useRef, useState } from "react";

import { BackLink } from "@/components/back-link";
import { ChevronUpIcon, ExternalLinkIcon } from "@/components/icons";
import { PlexLink } from "@/components/open-plex";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "cn";
import { useTranslator } from "@/lib/i18n/client";

/**
 * The ways out of a title: back to where it was opened from, over to Plex, and
 * up to the top.
 *
 * At rest they sit in a row above the title. Once that row has scrolled away,
 * ten seasons down, the same three come back as a dock at the bottom of the
 * screen, where a thumb already is. It is the bottom and not the top because
 * the top already belongs to the header and to the season headings that stick
 * under it, and a third sticky band there would eat the screen the episodes
 * need. The dock only appears once the row is gone, so the page never offers
 * the same button twice at once.
 */
export function TitleDock({
  title,
  plex,
  fallback,
}: {
  title: string;
  plex: { web: string; app: string } | null;
  fallback: string;
}) {
  const t = useTranslator();
  const row = useRef<HTMLDivElement>(null);
  const [docked, setDocked] = useState(false);

  useEffect(() => {
    const target = row.current;
    if (!target) return;
    // Docked only when the row has left through the top: a row still below
    // the fold, on a short window, is not a row that is out of reach.
    const observer = new IntersectionObserver(([entry]) =>
      setDocked(!entry.isIntersecting && entry.boundingClientRect.top < 0),
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  const plexLink = (className: string) =>
    plex ? (
      <PlexLink web={plex.web} app={plex.app} className={className}>
        {t("title.openPlex")}
        <ExternalLinkIcon />
      </PlexLink>
    ) : null;

  return (
    <>
      <div ref={row} className="flex items-center justify-between gap-3">
        <BackLink fallback={fallback} />
        {plexLink(buttonVariants({ variant: "secondary", size: "sm" }))}
      </div>

      <div
        role="toolbar"
        aria-label={t("title.actions")}
        // Hidden rather than removed, so it slides instead of popping, and out
        // of the tab order and the screen reader while it is not there.
        aria-hidden={!docked}
        inert={!docked}
        className={cn(
          "bg-background/80 ring-foreground/10 fixed inset-x-0 z-30 mx-auto flex w-fit max-w-[calc(100%-2rem)] items-center gap-1 rounded-full p-1.5 shadow-lg ring-1 backdrop-blur",
          "bottom-[max(1rem,env(safe-area-inset-bottom))] sm:bottom-6",
          "transition-[opacity,translate] duration-250 ease-(--ease-out-quint) motion-reduce:transition-opacity",
          docked
            ? "translate-y-0 opacity-100"
            : "pointer-events-none translate-y-4 opacity-0 motion-reduce:translate-y-0",
        )}
      >
        <BackLink fallback={fallback} className="ml-0 rounded-full" />
        <span
          aria-hidden
          className="text-muted-foreground hidden max-w-56 truncate px-2 text-sm md:block"
        >
          {title}
        </span>
        {plexLink(
          buttonVariants({
            variant: "secondary",
            size: "sm",
            className: "rounded-full",
          }),
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          className="rounded-full"
          aria-label={t("common.backToTop")}
          onClick={() =>
            window.scrollTo({
              top: 0,
              // The stylesheet cannot reach a scroll asked for in script, so
              // the preference is read here too.
              behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
                .matches
                ? "auto"
                : "smooth",
            })
          }
        >
          <ChevronUpIcon />
        </Button>
      </div>
    </>
  );
}
