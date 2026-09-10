import type { Metadata } from "next";

import { ActionButton } from "@/components/admin/action-button";
import { Pagination } from "@/components/pagination";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  countTrackedSeries,
  listOpenEpisodeTasks,
  listTrackedSeries,
} from "@/lib/domain/series";
import { formatDate, formatEpisodeCode } from "@/lib/format";
import { requireStaffPage } from "@/lib/auth/session";
import { getI18n, getTranslator } from "@/lib/i18n/server";
import { paginate, parsePage, toSearchParams } from "@/lib/pagination";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslator();
  return { title: t("meta.admin", { section: t("admin.nav.series") }) };
}

/**
 * Rows per list. The two lists page on their own parameter, so stepping back
 * through the tracked shows does not move the tasks above them.
 */
const PER_PAGE = 30;

/**
 * Series tracker.
 *
 * Two lists: what is being watched, and what the watching turned up. A task
 * closes itself when the episode appears on the server, so the buttons here are
 * for the cases automation cannot settle.
 *
 * Both are read one page at a time, each on its own parameter: a season that
 * aired into an empty library opens one task per episode, and every task and
 * every show carries buttons of its own. The slices are cut here rather than
 * in the queries, since neither list takes a window and this page does not own
 * the domain layer.
 */
export default async function AdminSeriesPage({
  searchParams,
}: PageProps<"/admin/series">) {
  await requireStaffPage();
  const { t, locale } = await getI18n();

  const params = toSearchParams(await searchParams);

  // Two lists on one screen, each paged on its own parameter: acting on a task
  // must not send the series list back to its first page.
  const [seriesTotal, allTasks] = await Promise.all([
    countTrackedSeries(),
    listOpenEpisodeTasks(),
  ]);

  const taskPage = paginate(
    allTasks.length,
    parsePage(params.get("tasks")),
    PER_PAGE,
  );
  const seriesPage = paginate(
    seriesTotal,
    parsePage(params.get("series")),
    PER_PAGE,
  );
  const tasks = allTasks.slice(
    taskPage.offset,
    taskPage.offset + taskPage.perPage,
  );
  const series = await listTrackedSeries({
    limit: seriesPage.perPage,
    offset: seriesPage.offset,
  });

  return (
    <>
      <Card id="tasks" className="scroll-mt-28 lg:scroll-mt-20">
        <CardHeader>
          <CardTitle>{t("admin.episodes.tasks")}</CardTitle>
        </CardHeader>
        <CardContent>
          {allTasks.length === 0 ? (
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
                      <span className="text-muted-foreground font-mono text-xs font-normal">
                        {formatEpisodeCode(
                          task.seasonNumber,
                          task.episodeNumber,
                        )}
                      </span>
                    </p>
                    <p className="text-muted-foreground truncate text-xs">
                      {[
                        task.airDate
                          ? t("admin.episodes.aired", {
                              date: formatDate(task.airDate, locale),
                            })
                          : null,
                        task.episodeTitle,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
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

          <Pagination
            page={taskPage}
            pathname="/admin/series"
            params={params}
            paramKey="tasks"
            hash="tasks"
            label={t("pagination.tasks")}
            className="mt-4"
          />
        </CardContent>
      </Card>

      <Card id="series" className="scroll-mt-28 lg:scroll-mt-20">
        <CardHeader>
          <CardTitle>{t("admin.series.tracked")}</CardTitle>
        </CardHeader>
        <CardContent>
          {seriesTotal === 0 ? (
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
                      {[
                        show.providerStatus,
                        `${t("admin.series.lastSync")}: ${
                          show.lastSyncedAt
                            ? formatDate(show.lastSyncedAt, locale)
                            : t("admin.series.never")
                        }`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  {show.missing > 0 ? (
                    <Badge>
                      {t("admin.series.missing", { count: show.missing })}
                    </Badge>
                  ) : null}
                  {show.enabled ? null : (
                    <Badge variant="outline">{t("admin.series.paused")}</Badge>
                  )}
                  <ActionButton
                    url={`/api/admin/series/${show.id}`}
                    body={{ enabled: !show.enabled }}
                    size="sm"
                    variant={show.enabled ? "ghost" : "secondary"}
                  >
                    {show.enabled
                      ? t("admin.series.pause")
                      : t("admin.series.resume")}
                  </ActionButton>
                </li>
              ))}
            </ul>
          )}

          <Pagination
            page={seriesPage}
            pathname="/admin/series"
            params={params}
            paramKey="series"
            hash="series"
            label={t("pagination.series")}
            className="mt-4"
          />
        </CardContent>
      </Card>
    </>
  );
}
