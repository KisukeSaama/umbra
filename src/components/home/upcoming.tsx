import { EmptyNote } from "@/components/empty-note";
import { SeriesIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { UpcomingEpisode } from "@/lib/domain/series";
import { formatAirDate, formatEpisodeCode } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";

/**
 * Next broadcasts of tracked series.
 *
 * The list is ordered by the member rather than by the calendar alone: the
 * shows they are on come first, marked as such, and the rest of the week
 * follows.
 *
 * The wording never promises availability: a date is a broadcast, and the
 * server catching up with it is a separate thing.
 */
export async function UpcomingEpisodes({
  episodes,
}: {
  episodes: UpcomingEpisode[];
}) {
  const { t, locale } = await getI18n();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("section.comingThisWeek")}</CardTitle>
      </CardHeader>
      <CardContent>
        {episodes.length === 0 ? (
          <EmptyNote icon={SeriesIcon}>{t("week.noEpisodes")}</EmptyNote>
        ) : (
          <ul className="divide-border/60 -my-2 divide-y">
            {episodes.map((episode) => (
              <li
                key={`${episode.seriesTitle}-${episode.seasonNumber}-${episode.episodeNumber}`}
                className="flex items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <p className="truncate text-sm font-medium">
                      {episode.seriesTitle}
                    </p>
                    {/* Why this line is at the top of the card, said once and
                        quietly: the show is one the member is already on. */}
                    {episode.followed ? (
                      <Badge variant="outline">{t("week.following")}</Badge>
                    ) : null}
                  </div>
                  <p className="text-muted-foreground truncate text-xs">
                    {formatEpisodeCode(
                      episode.seasonNumber,
                      episode.episodeNumber,
                    )}
                    {episode.episodeTitle ? ` · ${episode.episodeTitle}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {episode.airDate ? (
                    <time
                      dateTime={episode.airDate}
                      className="text-muted-foreground text-xs"
                    >
                      {formatAirDate(episode.airDate, locale)}
                    </time>
                  ) : null}
                  <Badge
                    variant={
                      episode.status === "aired_missing"
                        ? "default"
                        : "secondary"
                    }
                  >
                    {episode.status === "aired_missing"
                      ? t("week.missing")
                      : t("week.upcoming")}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
