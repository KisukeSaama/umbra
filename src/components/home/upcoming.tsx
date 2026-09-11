import Link from "next/link";

import { EmptyNote } from "@/components/empty-note";
import { SeriesIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { UpcomingEpisode } from "@/lib/domain/series";
import { formatAirDate, formatEpisodeCode } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";

/**
 * The week of the shows the member is on: what came out, what is due, and
 * whether the server has it.
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
}: {
  episodes: UpcomingEpisode[];
  /** The list comes from what the member watches, not the server calendar. */
  personal: boolean;
}) {
  const { t, locale } = await getI18n();
  // A pill that reads the same on every row says nothing the date does not:
  // it stays only while there is a difference to point at, an episode already
  // out or one the server holds.
  const uniform = episodes.every((episode) => episode.status === "scheduled");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("section.comingThisWeek")}</CardTitle>
        {!personal && episodes.length > 0 ? (
          <p className="text-muted-foreground text-sm">
            {t("week.calendarNote")}
          </p>
        ) : null}
      </CardHeader>
      <CardContent>
        {episodes.length === 0 ? (
          <EmptyNote icon={SeriesIcon}>{t("week.noEpisodes")}</EmptyNote>
        ) : (
          <ul className="divide-border/60 -my-2 divide-y">
            {episodes.map((episode, index) => (
              <li
                key={`${episode.providerId}-${episode.seasonNumber}-${episode.episodeNumber}`}
              >
                {/* The row opens the series, underlined under the pointer and
                    ringed for the keyboard, like every other row that does. */}
                <Link
                  href={`/title/tv/${episode.providerId}`}
                  className="group focus-visible:ring-ring/50 flex items-center justify-between gap-3 rounded-md py-3 outline-none focus-visible:ring-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium group-hover:underline">
                      {episode.seriesTitle}
                    </p>
                    <p className="text-muted-foreground truncate text-xs">
                      {formatEpisodeCode(
                        episode.seasonNumber,
                        episode.episodeNumber,
                      )}
                      {episode.episodeTitle ? ` · ${episode.episodeTitle}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {/* The next broadcast is the one date the card is for, so
                        it alone takes the lamp: a state, not a decoration. */}
                    {episode.airDate ? (
                      <time
                        dateTime={episode.airDate}
                        className={
                          index === 0
                            ? "text-primary text-xs font-medium"
                            : "text-muted-foreground text-xs"
                        }
                      >
                        {formatAirDate(episode.airDate, locale)}
                      </time>
                    ) : null}
                    {uniform ? null : (
                      <Badge variant={BADGE[episode.status]}>
                        {t(LABEL[episode.status])}
                      </Badge>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
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
