import Link from "next/link";

import { EmptyNote } from "@/components/empty-note";
import { SeriesIcon } from "@/components/icons";
import { Poster } from "@/components/poster";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { UpcomingEpisode } from "@/lib/domain/series";
import { airDayParts, dayKey, formatEpisodeCode } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { posterUrl } from "@/lib/providers/tmdb";
import { cn } from "@/lib/utils";
import { shiftDate } from "@/lib/week";

/**
 * The week of the shows the member is on, read as a diary: one tile per day,
 * and under it the shows that air that day.
 *
 * A list of rows repeated the series name once per episode and the date once
 * per row, so two episodes of one show on one day read as two events. Grouped
 * by day and then by show, the card says what a member actually asks: which
 * evening, which show, which episodes.
 *
 * When nothing they watch airs this week, the card says so once and shows the
 * server's own calendar instead, so it never reads as the member's list.
 *
 * The wording never promises availability: a date is a broadcast, and the
 * server catching up with it is a separate thing.
 */
export async function UpcomingEpisodes({
  episodes,
  personal,
  className,
}: {
  episodes: UpcomingEpisode[];
  /** The list comes from what the member watches, not the server calendar. */
  personal: boolean;
  className?: string;
}) {
  const { t, locale } = await getI18n();
  // A pill that reads the same on every row says nothing the date does not:
  // it stays only while there is a difference to point at, an episode already
  // out or one the server holds.
  const uniform = episodes.every((episode) => episode.status === "scheduled");
  const days = byDay(episodes);
  const today = dayKey();
  const tomorrow = shiftDate(today, 1);

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{t("section.comingThisWeek")}</CardTitle>
        {!personal && episodes.length > 0 ? (
          <p className="text-muted-foreground text-sm">
            {t("week.calendarNote")}
          </p>
        ) : null}
      </CardHeader>
      <CardContent>
        {days.length === 0 ? (
          <EmptyNote icon={SeriesIcon}>{t("week.noEpisodes")}</EmptyNote>
        ) : (
          <ol className="space-y-4">
            {days.map(({ date, shows }, index) => {
              const parts = airDayParts(date, locale);
              const near =
                date === today
                  ? t("week.today")
                  : date === tomorrow
                    ? t("week.tomorrow")
                    : null;
              return (
                <li key={date} className="flex gap-4">
                  {/* The tile is the date, set the way a wall calendar sets
                      it. The next broadcast day alone takes the lamp: a
                      state, not a decoration. */}
                  <time
                    dateTime={date}
                    className="bg-secondary/60 flex w-14 shrink-0 flex-col items-center self-start rounded-lg py-2 leading-none"
                  >
                    <span
                      className={cn(
                        "text-xs font-medium",
                        index === 0 ? "text-primary" : "text-muted-foreground",
                      )}
                    >
                      {parts.weekday}
                    </span>
                    <span className="mt-1.5 text-2xl font-semibold tabular-nums">
                      {parts.day}
                    </span>
                    <span className="text-muted-foreground mt-1.5 text-xs">
                      {parts.month}
                    </span>
                  </time>
                  <div className="min-w-0 flex-1">
                    {near ? (
                      <p className="text-muted-foreground pb-1 text-xs font-medium">
                        {near}
                      </p>
                    ) : null}
                    <ul className="divide-border/60 divide-y">
                      {shows.map((show) => (
                        <li key={show.providerId}>
                          <Link
                            href={`/title/tv/${show.providerId}`}
                            className="group focus-visible:ring-ring/50 flex items-center gap-3 rounded-md py-1.5 outline-none focus-visible:ring-3"
                          >
                            <div className="w-9 shrink-0">
                              <Poster
                                src={posterUrl(show.posterPath)}
                                alt={show.seriesTitle}
                                captioned
                                sizes="2.25rem"
                                className="rounded-md"
                              />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium group-hover:underline">
                                {show.seriesTitle}
                              </p>
                              <p className="text-muted-foreground truncate text-xs tabular-nums">
                                {show.episodes
                                  .map((episode) =>
                                    formatEpisodeCode(
                                      episode.seasonNumber,
                                      episode.episodeNumber,
                                    ),
                                  )
                                  .join(", ")}
                                {show.episodes.length === 1 &&
                                show.episodes[0].episodeTitle
                                  ? ` · ${show.episodes[0].episodeTitle}`
                                  : ""}
                              </p>
                            </div>
                            {uniform ? null : (
                              <Badge
                                variant={BADGE[show.status]}
                                className="shrink-0"
                              >
                                {t(LABEL[show.status])}
                              </Badge>
                            )}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

type Show = {
  providerId: string;
  seriesTitle: string;
  posterPath: string | null;
  status: UpcomingEpisode["status"];
  episodes: UpcomingEpisode[];
};

/**
 * The episodes as days, then shows within a day, both in the order they came:
 * the list is already sorted by air date. An undated episode has no day to sit
 * on, and the queries never return one.
 */
function byDay(episodes: UpcomingEpisode[]) {
  const days = new Map<string, Map<string, Show>>();
  for (const episode of episodes) {
    if (!episode.airDate) continue;
    const shows = days.get(episode.airDate) ?? new Map<string, Show>();
    const show = shows.get(episode.providerId);
    if (show) {
      show.episodes.push(episode);
      // Late outranks everything on the day: that is the one worth a pill.
      if (episode.status === "aired_missing") show.status = "aired_missing";
    } else {
      shows.set(episode.providerId, {
        providerId: episode.providerId,
        seriesTitle: episode.seriesTitle,
        posterPath: episode.posterPath,
        status: episode.status,
        episodes: [episode],
      });
    }
    days.set(episode.airDate, shows);
  }
  return [...days].map(([date, shows]) => ({ date, shows: [...shows.values()] }));
}

const BADGE = {
  aired_missing: "default",
  scheduled: "secondary",
  available: "outline",
} as const;

const LABEL = {
  aired_missing: "week.missing",
  scheduled: "week.upcoming",
  available: "week.available",
} as const;
