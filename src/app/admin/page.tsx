import Link from "next/link";

import { ActionButton } from "@/components/admin/action-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdminPage } from "@/lib/auth/session";
import { pendingAccountCount } from "@/lib/domain/accounts";
import { activePoll } from "@/lib/domain/polls";
import { listReports } from "@/lib/domain/reports";
import { countRequestsByStatus, listRequests } from "@/lib/domain/requests";
import { listOpenEpisodeTasks } from "@/lib/domain/series";
import { storageOverview } from "@/lib/domain/storage";
import { formatDateTime, formatEpisodeCode } from "@/lib/format";
import type { TranslationKey } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n/server";
import { jobStatus } from "@/lib/jobs";
import { LIVE_REPORT_STATUSES } from "@/lib/reports/reasons";

/**
 * Today.
 *
 * Not a dashboard: a queue. Everything that is waiting on a decision, in the
 * order it arrived, with the decision available on the row rather than three
 * pages away. Counters nobody acts on live on the pages they belong to.
 *
 * When the queue is empty the page says so and stops, which is the only honest
 * thing a page like this can do on a quiet day.
 */
export default async function AdminTodayPage() {
  await requireAdminPage();
  const { t, locale } = await getI18n();

  const [
    requests,
    reports,
    tasks,
    poll,
    pendingAccounts,
    counts,
    storage,
    jobs,
  ] = await Promise.all([
    listRequests(["requested"]),
    listReports([...LIVE_REPORT_STATUSES]),
    listOpenEpisodeTasks(),
    activePoll(),
    pendingAccountCount(),
    countRequestsByStatus(),
    storageOverview(),
    jobStatus(),
  ]);

  const quiet =
    requests.length === 0 &&
    reports.length === 0 &&
    tasks.length === 0 &&
    pendingAccounts === 0;

  const lastSync = jobs
    .map((job) => job.lastSuccessAt)
    .filter((date): date is Date => date !== null)
    .sort((a, b) => b.getTime() - a.getTime())[0];

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t("admin.today")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {quiet ? (
            <p className="text-muted-foreground text-sm">
              {t("admin.inbox.clear")}
            </p>
          ) : null}

          {requests.length > 0 ? (
            <Queue
              title={t("admin.inbox.requests", { count: requests.length })}
              href="/admin/requests"
              label={t("admin.nav.requests")}
            >
              {requests.slice(0, 6).map((request) => (
                <Row
                  key={request.id}
                  main={request.media.title}
                  aside={
                    request.media.year ? String(request.media.year) : undefined
                  }
                >
                  <ActionButton
                    url={`/api/admin/requests/${request.id}`}
                    body={{ status: "accepted" }}
                    size="xs"
                  >
                    {t("admin.requests.accept")}
                  </ActionButton>
                  <ActionButton
                    url={`/api/admin/requests/${request.id}`}
                    body={{ status: "rejected" }}
                    size="xs"
                    variant="ghost"
                  >
                    {t("admin.requests.reject")}
                  </ActionButton>
                </Row>
              ))}
            </Queue>
          ) : null}

          {reports.length > 0 ? (
            <Queue
              title={t("admin.inbox.reports", { count: reports.length })}
              href="/admin/reports"
              label={t("admin.nav.reports")}
            >
              {reports.slice(0, 6).map((report) => (
                <Row
                  key={report.id}
                  main={report.media.title}
                  aside={t(`report.reason.${report.reason}` as TranslationKey)}
                >
                  {report.status === "open" ? (
                    <ActionButton
                      url={`/api/admin/reports/${report.id}`}
                      body={{ status: "acknowledged" }}
                      size="xs"
                    >
                      {t("admin.reports.acknowledge")}
                    </ActionButton>
                  ) : (
                    <ActionButton
                      url={`/api/admin/reports/${report.id}`}
                      body={{ status: "resolved" }}
                      size="xs"
                    >
                      {t("admin.reports.resolve")}
                    </ActionButton>
                  )}
                </Row>
              ))}
            </Queue>
          ) : null}

          {tasks.length > 0 ? (
            <Queue
              title={t("admin.inbox.episodes", { count: tasks.length })}
              href="/admin/series"
              label={t("admin.nav.series")}
            >
              {tasks.slice(0, 6).map((task) => (
                <Row
                  key={task.id}
                  main={task.seriesTitle}
                  aside={formatEpisodeCode(
                    task.seasonNumber,
                    task.episodeNumber,
                  )}
                >
                  <ActionButton
                    url={`/api/admin/episodes/tasks/${task.id}`}
                    body={{ status: "done" }}
                    size="xs"
                    variant="secondary"
                  >
                    {t("admin.episodes.done")}
                  </ActionButton>
                </Row>
              ))}
            </Queue>
          ) : null}

          {pendingAccounts > 0 ? (
            <Queue
              title={t("admin.inbox.accounts", { count: pendingAccounts })}
              href="/admin/accounts"
              label={t("admin.nav.accounts")}
            />
          ) : null}

          {poll ? (
            <p className="text-muted-foreground text-sm">
              <Link href="/admin/polls" className="hover:text-primary">
                {t("admin.inbox.polls", { count: 1 })}
              </Link>
            </p>
          ) : null}
        </CardContent>
      </Card>

      {/* Two glances, not three cards: the numbers that are decisions live in
          the queue above, and these are the only ones left worth a look. */}
      <dl className="text-muted-foreground flex flex-wrap gap-x-8 gap-y-2 text-sm">
        <div className="flex items-baseline gap-2">
          <dt>{t("section.storage")}</dt>
          <dd className="text-foreground tabular-nums">
            {storage
              ? t("storage.used", {
                  percent: `${Math.round(storage.usedRatio * 100)}%`,
                })
              : t("storage.unknown")}
          </dd>
        </div>
        <div className="flex items-baseline gap-2">
          <dt>{t("admin.requests.status.processing")}</dt>
          <dd className="text-foreground tabular-nums">{counts.processing}</dd>
        </div>
        <div className="flex items-baseline gap-2">
          <dt>{t("admin.jobs.lastSuccess")}</dt>
          <dd>
            <Link
              href="/admin/jobs"
              className="text-foreground hover:text-primary focus-visible:ring-ring/50 rounded-md tabular-nums transition-colors outline-none focus-visible:ring-3"
            >
              {lastSync
                ? formatDateTime(lastSync, locale)
                : t("admin.jobs.never")}
            </Link>
          </dd>
        </div>
      </dl>
    </>
  );
}

function Queue({
  title,
  href,
  label,
  children,
}: {
  title: string;
  href: string;
  label: string;
  children?: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <span className="bg-primary size-1.5 rounded-full" aria-hidden />
          {title}
        </h2>
        <Link
          href={href}
          className="text-muted-foreground hover:text-primary focus-visible:ring-ring/50 rounded-md text-xs transition-colors outline-none focus-visible:ring-3"
        >
          {label}
        </Link>
      </div>
      {children ? (
        <ul className="divide-border/60 divide-y">{children}</ul>
      ) : null}
    </section>
  );
}

function Row({
  main,
  aside,
  children,
}: {
  main: string;
  aside?: string;
  children?: React.ReactNode;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2">
      <span className="truncate text-sm">{main}</span>
      {aside ? (
        <Badge variant="outline" className="shrink-0">
          {aside}
        </Badge>
      ) : null}
      <span className="ml-auto flex shrink-0 gap-1.5">{children}</span>
    </li>
  );
}
