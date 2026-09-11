"use client";

import { useRef, useState } from "react";

import {
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CircleIcon,
  ClockIcon,
} from "@/components/icons";
import { LoadingRegion, TextLine } from "@/components/skeletons";
import { Badge } from "@/components/ui/badge";
import { UpdateAsk } from "@/components/update-ask";
import { isOnServer, type Availability } from "@/lib/domain/availability";
import type { EpisodeState, SeasonState } from "@/lib/domain/catalog";
import {
  isSeasonComplete,
  isSeasonMissing,
  isSeasonReleased,
  isUnaired,
} from "@/lib/domain/seasons";
import { formatDate } from "@/lib/format";
import {
  askKey,
  isSettled,
  NOTHING_SETTLED,
  type SettledAsks,
} from "@/lib/reports/reasons";
import { useLocale, useTranslator } from "@/lib/i18n/client";
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
  openAsks = [],
  settled = NOTHING_SETTLED,
}: {
  providerId: string;
  seasons: SeasonState[];
  availability: Availability;
  /** Keys of the asks already open on this series, from `askKey`. */
  openAsks?: string[];
  /**
   * What the administration has answered since the last scan. The counts below
   * come from the index, so they still show the gap it has just filled: a
   * season it covers is drawn as whole and stops offering the ask, exactly as
   * the search has stopped calling the series partial.
   */
  settled?: SettledAsks;
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
        {seasons.map((season, index) => {
          const expanded = open === season.seasonNumber;
          // The row fills a corner of the list, so its hover has to take the
          // same curve or it paints a square over it.
          const first = index === 0;
          const last = index === seasons.length - 1;
          const listed = episodes[season.seasonNumber];
          const released = isSeasonReleased(season);
          const complete =
            isSeasonComplete(season) || isSettled(settled, season.seasonNumber);
          // A report is about something the server is supposed to hold, so the
          // ask only exists once the series itself is there, and once the
          // season is more than an announcement.
          const canAsk = isOnServer(availability) && released && !complete;
          // Nothing of it here is a missing season; some of it here is missing
          // episodes. The reason decides the wording and the key alike.
          const askReason = isSeasonMissing(season)
            ? ("missing_season" as const)
            : ("missing_episode" as const);

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
                  "focus-visible:ring-ring/50 flex w-full items-center gap-3 px-3 py-3 text-left transition-colors outline-none focus-visible:ring-3",
                  expanded
                    ? "hover:bg-[color-mix(in_oklab,var(--muted)_40%,var(--umbra-surface,var(--background)))]"
                    : "hover:bg-muted/40",
                  first && "rounded-t-xl",
                  last && !expanded && "rounded-b-xl",
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

                <SeasonBadge
                  season={season}
                  complete={complete}
                  released={released}
                />
              </button>

              {expanded ? (
                <div className="space-y-3 px-3 pb-3">
                  {loading === season.seasonNumber ? (
                    <EpisodeRowsSkeleton
                      count={season.episodeCount}
                      label={t("common.loading")}
                    />
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
                        reason={askReason}
                        asked={openAsks.includes(
                          askKey({
                            seasonNumber: season.seasonNumber,
                            reason: askReason,
                          }),
                        )}
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
 *
 * An episode the provider has dated in the future is the exception: it is
 * absent because it has not been broadcast, so the line states the date instead
 * of a shortfall, on every screen width. The date is a broadcast, never a
 * promise that the server will hold it that day.
 */
function EpisodeRow({ episode }: { episode: EpisodeState }) {
  const t = useTranslator();
  const locale = useLocale();
  const number = t("season.episodeShort", { number: episode.episodeNumber });
  const upcoming = !episode.onServer && isUnaired(episode.airDate);

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
      ) : upcoming && episode.airDate ? (
        <span className="text-muted-foreground flex shrink-0 items-center gap-1.5 text-xs">
          <ClockIcon />
          <span className="sr-only">{t("season.airsOn")}</span>
          <time dateTime={episode.airDate} className="tabular-nums">
            {formatDate(episode.airDate, locale)}
          </time>
        </span>
      ) : (
        <span className="text-muted-foreground flex shrink-0 items-center gap-1.5 text-xs">
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
function SeasonBadge({
  season,
  complete,
  released,
}: {
  season: SeasonState;
  /** Whole, whether the index says so or the administration has just said so. */
  complete: boolean;
  /** More than an announcement: see `isSeasonReleased`. */
  released: boolean;
}) {
  const t = useTranslator();

  if (!released) return <Badge variant="outline">{t("season.upcoming")}</Badge>;

  if (!complete && isSeasonMissing(season))
    return <Badge variant="outline">{t("season.notOnServer")}</Badge>;

  if (complete)
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

/**
 * The episodes of a season while they are fetched: as many lines as the
 * provider says the season holds, so the list does not grow under the finger
 * when they land. A season it has not counted yet gets a handful.
 */
function EpisodeRowsSkeleton({
  count,
  label,
}: {
  count: number;
  label: string;
}) {
  const widths = ["w-1/2", "w-2/3", "w-2/5"];
  return (
    <LoadingRegion label={label} className="divide-border/40 divide-y">
      {Array.from({ length: Math.min(count || 4, 10) }, (_, index) => (
        <div key={index} className="flex items-center gap-3 py-2">
          <TextLine size="xs" className="w-8 shrink-0" />
          <TextLine size="sm" className={widths[index % widths.length]} />
          <TextLine size="xs" className="ml-auto w-4 shrink-0 sm:w-20" />
        </div>
      ))}
    </LoadingRegion>
  );
}
