import { ActionButton } from "@/components/admin/action-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listOpenEpisodeTasks, listTrackedSeries } from "@/lib/domain/series";
import { formatEpisodeCode } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";

/**
 * Series tracker.
 *
 * Two lists: what is being watched, and what the watching turned up. A task
 * closes itself when the episode appears on the server, so the buttons here are
 * for the cases automation cannot settle.
 */
export default async function AdminSeriesPage() {
  const { t, locale } = await getI18n();
  const [series, tasks] = await Promise.all([
    listTrackedSeries(),
    listOpenEpisodeTasks(),
  ]);
  const formatDate = (value: Date | string) =>
    new Date(
      typeof value === "string" ? `${value}T12:00:00Z` : value,
    ).toLocaleDateString(locale === "fr" ? "fr-FR" : "en-US");

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t("admin.episodes.tasks")}</CardTitle>
        </CardHeader>
        <CardContent>
          {tasks.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("common.empty")}</p>
          ) : (
            <ul className="divide-border/60 -my-2 divide-y">
              {tasks.map((task) => (
                <li
                  key={task.id}
                  className="flex flex-wrap items-center gap-3 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {task.seriesTitle}{" "}
                      {formatEpisodeCode(task.seasonNumber, task.episodeNumber)}
                    </p>
                    <p className="text-muted-foreground truncate text-xs">
                      {task.airDate
                        ? t("admin.episodes.aired", {
                            date: formatDate(task.airDate),
                          })
                        : ""}
                      {task.episodeTitle ? ` - ${task.episodeTitle}` : ""}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <ActionButton
                      url={`/api/admin/episodes/tasks/${task.id}`}
                      body={{ status: "done" }}
                      size="sm"
                    >
                      {t("admin.episodes.done")}
                    </ActionButton>
                    <ActionButton
                      url={`/api/admin/episodes/tasks/${task.id}`}
                      body={{ status: "dismissed" }}
                      size="sm"
                      variant="ghost"
                    >
                      {t("admin.episodes.dismiss")}
                    </ActionButton>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("admin.series.tracked")}</CardTitle>
        </CardHeader>
        <CardContent>
          {series.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("common.empty")}</p>
          ) : (
            <ul className="divide-border/60 -my-2 divide-y">
              {series.map((show) => (
                <li
                  key={show.id}
                  className="flex flex-wrap items-center gap-3 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{show.title}</p>
                    <p className="text-muted-foreground truncate text-xs">
                      {show.providerStatus ?? ""} - {t("admin.series.lastSync")}
                      :{" "}
                      {show.lastSyncedAt
                        ? formatDate(show.lastSyncedAt)
                        : t("admin.series.never")}
                    </p>
                  </div>
                  {show.missing > 0 ? (
                    <Badge>
                      {t("admin.series.missing", { count: show.missing })}
                    </Badge>
                  ) : null}
                  <ActionButton
                    url={`/api/admin/series/${show.id}`}
                    body={{ enabled: !show.enabled }}
                    size="sm"
                    variant={show.enabled ? "secondary" : "ghost"}
                  >
                    {show.enabled
                      ? t("admin.polls.deactivate")
                      : t("admin.polls.activate")}
                  </ActionButton>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
