"use client";

import { useRef, useState } from "react";

import {
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CircleIcon,
  SpinnerIcon,
} from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { UpdateAsk } from "@/components/update-ask";
import type {
  Availability,
  EpisodeState,
  SeasonState,
} from "@/lib/domain/catalog";
import { isSeasonComplete, isSeasonMissing } from "@/lib/domain/seasons";
import { useTranslator } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

/**
 * The ladder of a series, and where the server stands on it.
 *
 * A member looking at a show asks one question before any other: is the season
 * I am after here, and how much of it. So every season states its own count
 * against what the provider says the season is made of, and opening one lists
 * the episodes with the same answer per line. A season that falls short then
 * carries the way to ask for the rest, on the very line that shows the gap.
 *
 * Episodes are fetched when a season is opened and kept afterwards: a show with
 * forty seasons must not cost forty calls to be looked at, and folding a season
 * back must not throw away what was already paid for.
 */
export function SeasonList({
  providerId,
  seasons,
  availability,
}: {
  providerId: string;
  seasons: SeasonState[];
  availability: Availability;
}) {
  const t = useTranslator();
  const [open, setOpen] = useState<number | null>(null);
  const [episodes, setEpisodes] = useState<Record<number, EpisodeState[]>>({});
  const [loading, setLoading] = useState<number | null>(null);
  const [failed, setFailed] = useState<number | null>(null);
  const rows = useRef(new Map<number, HTMLLIElement | null>());

  async function toggle(seasonNumber: number) {
    if (open === seasonNumber) {
      setOpen(null);
      return;
    }
    setOpen(seasonNumber);
    /*
     * A season opened at the foot of a phone unfolds below the fold: the press
     * is answered by a screen that has not visibly changed. Bringing the row it
     * came from to the top hands the whole panel to the episodes, and does it
     * after the paint so the list is already there to scroll through.
     */
    requestAnimationFrame(() =>
      rows.current.get(seasonNumber)?.scrollIntoView({
        block: "start",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      }),
    );
    if (episodes[seasonNumber]) return;

    setLoading(seasonNumber);
    setFailed(null);
    try {
      const response = await fetch(
        `/api/series/episodes?providerId=${encodeURIComponent(providerId)}&season=${seasonNumber}`,
      );
      const body = await response.json();
      if (!response.ok) throw new Error("unavailable");
      setEpisodes((current) => ({
        ...current,
        [seasonNumber]: body.episodes as EpisodeState[],
      }));
    } catch {
      setFailed(seasonNumber);
    } finally {
      setLoading(null);
    }
  }

  if (seasons.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold tracking-tight">
        {t("season.heading")}
      </h2>

      <ul className="divide-border/60 border-border/60 divide-y rounded-xl border">
        {seasons.map((season) => {
          const expanded = open === season.seasonNumber;
          const listed = episodes[season.seasonNumber];
          // A report is about something the server is supposed to hold, so the
          // ask only exists once the series itself is there.
          const canAsk =
            availability === "available" && !isSeasonComplete(season);

          return (
            <li
              key={season.seasonNumber}
              ref={(node) => {
                rows.current.set(season.seasonNumber, node);
              }}
              className="scroll-mt-[calc(var(--umbra-sticky-top)+0.5rem)]"
            >
              <button
                type="button"
                onClick={() => void toggle(season.seasonNumber)}
                aria-expanded={expanded}
                className={cn(
                  "focus-visible:ring-ring/50 hover:bg-muted/40 flex w-full items-center gap-3 px-3 py-3 text-left outline-none focus-visible:ring-3",
                  // Kept in sight while its own episodes scroll under it: a
                  // list of twenty lines otherwise loses the season it belongs
                  // to on the first swipe.
                  expanded &&
                    "umbra-surface sticky top-[var(--umbra-sticky-top)] z-10",
                )}
              >
                {expanded ? (
                  <ChevronDownIcon className="text-muted-foreground size-4 shrink-0" />
                ) : (
                  <ChevronRightIcon className="text-muted-foreground size-4 shrink-0" />
                )}

                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">
                    {t("season.number", { number: season.seasonNumber })}
                  </span>
                  {season.episodeCount > 0 ? (
                    <span className="text-muted-foreground block text-xs">
                      {t("season.episodes", { count: season.episodeCount })}
                    </span>
                  ) : null}
                </span>

                <SeasonBadge season={season} />
              </button>

              {expanded ? (
                <div className="space-y-3 px-3 pb-3">
                  {loading === season.seasonNumber ? (
                    <p className="text-muted-foreground flex items-center gap-2 py-2 text-sm">
                      <SpinnerIcon />
                      {t("common.loading")}
                    </p>
                  ) : failed === season.seasonNumber ? (
                    <p className="text-muted-foreground py-2 text-sm">
                      {t("season.unavailable")}
                    </p>
                  ) : listed && listed.length > 0 ? (
                    <ul className="divide-border/40 divide-y">
                      {listed.map((episode) => (
                        <EpisodeRow
                          key={episode.episodeNumber}
                          episode={episode}
                        />
                      ))}
                    </ul>
                  ) : (
                    <p className="text-muted-foreground py-2 text-sm">
                      {t("season.noEpisodes")}
                    </p>
                  )}

                  {canAsk ? (
                    <div className="flex justify-end">
                      <UpdateAsk
                        kind="tv"
                        providerId={providerId}
                        seasonNumber={season.seasonNumber}
                        reason={
                          isSeasonMissing(season)
                            ? "missing_season"
                            : "missing_episode"
                        }
                        label={
                          isSeasonMissing(season)
                            ? "update.askSeason"
                            : "update.askEpisodes"
                        }
                      />
                    </div>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * One episode, on one line, on the narrowest screen there is.
 *
 * The answer is a word on a desktop and a mark on a phone: spelling "not on the
 * server" out at 360 pixels would leave a third of the line for the title and
 * cut every one of them short. The word stays for anyone reading with a screen
 * reader either way.
 */
function EpisodeRow({ episode }: { episode: EpisodeState }) {
  const t = useTranslator();
  const number = t("season.episodeShort", { number: episode.episodeNumber });

  return (
    <li className="flex items-center gap-3 py-2 text-sm">
      <span className="text-muted-foreground w-8 shrink-0 text-xs tabular-nums">
        {number}
      </span>
      <span className="min-w-0 flex-1 truncate">{episode.title ?? number}</span>
      {episode.onServer ? (
        <span className="text-primary flex shrink-0 items-center gap-1.5 text-xs">
          <CheckIcon />
          <span className="sr-only sm:not-sr-only">{t("season.onServer")}</span>
        </span>
      ) : (
        <span className="text-muted-foreground/70 flex shrink-0 items-center gap-1.5 text-xs">
          <CircleIcon />
          <span className="sr-only sm:not-sr-only">
            {t("season.notOnServer")}
          </span>
        </span>
      )}
    </li>
  );
}

/**
 * Three states, exactly like a title: here, partly here, not here. A season the
 * provider has not numbered yet falls back on the count alone rather than
 * claiming to be complete.
 */
function SeasonBadge({ season }: { season: SeasonState }) {
  const t = useTranslator();

  if (isSeasonMissing(season))
    return <Badge variant="outline">{t("season.notOnServer")}</Badge>;

  if (isSeasonComplete(season))
    return (
      <Badge variant="secondary">
        <CheckIcon />
        {t("season.complete")}
      </Badge>
    );

  return (
    <Badge variant="outline">
      {t("season.partial", {
        count: season.onServer,
        total: season.episodeCount || season.onServer,
      })}
    </Badge>
  );
}
