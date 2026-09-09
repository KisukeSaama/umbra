import Link from "next/link";

import { ActionButton } from "@/components/admin/action-button";
import { StatStrip } from "@/components/admin/stat-strip";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireStaffPage } from "@/lib/auth/session";
import { pendingAccountCount } from "@/lib/domain/accounts";
import { lastReportAt, listReports } from "@/lib/domain/reports";
import {
  countRequestsByStatus,
  lastRequestAt,
  listRequests,
} from "@/lib/domain/requests";
import { listOpenEpisodeTasks } from "@/lib/domain/series";
import { storageOverview } from "@/lib/domain/storage";
import { formatDateTime, formatEpisodeCode } from "@/lib/format";
import type { TranslationKey } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n/server";
import { LIVE_REPORT_STATUSES } from "@/lib/reports/reasons";

/**
 * The dashboard.
 *
 * Two readings, in this order. A strip of figures, so the state of the place is
 * one glance rather than four visits, then the queues themselves: everything
 * waiting on a decision, in the order it arrived, with the decision available
 * on the row rather than three pages away.
 *
 * The figures are counts of work, never a scoreboard: no trend arrow, no
 * gauge, and nothing about whether the server is up. If Umbra answered, it is.
 *
 * When every queue is empty the page says so and stops, which is the only
 * honest thing a page like this can do on a quiet day.
 */
export default async function AdminDashboardPage() {
  const viewer = await requireStaffPage();
  const { t, locale } = await getI18n();
  // Accounts are the administrator's alone, so an assistant is never shown a
  // queue they would be redirected away from.
  const isAdmin = viewer.role === "admin";

  const [
    requests,
    reports,
    tasks,
    pendingAccounts,
    counts,
    storage,
    latestRequest,
    latestReport,
  ] = await Promise.all([
    listRequests(["requested"]),
    listReports([...LIVE_REPORT_STATUSES]),
    listOpenEpisodeTasks(),
    isAdmin ? pendingAccountCount() : 0,
    countRequestsByStatus(),
    storageOverview(),
    lastRequestAt(),
    lastReportAt(),
  ]);

  const quiet =
    requests.length === 0 &&
    reports.length === 0 &&
    tasks.length === 0 &&
    pendingAccounts === 0;

  // The last time a member asked for something, request or report alike. It
  // tells the administration how warm the place is, which a job timestamp
  // never did.
  const lastSubmission = [latestRequest, latestReport]
    .filter((date): date is Date => date !== null)
    .sort((a, b) => b.getTime() - a.getTime())[0];

  return (
    <>
      <StatStrip
        stats={[
          { label: t("admin.stat.requests"), value: requests.length },
          { label: t("admin.stat.reports"), value: reports.length },
          { label: t("admin.stat.episodes"), value: tasks.length },
          {
            label: t("admin.requests.status.processing"),
            value: counts.processing,
          },
          ...(isAdmin
            ? [{ label: t("admin.stat.accounts"), value: pendingAccounts }]
            : []),
          {
            label: t("section.storage"),
            value: storage
              ? `${Math.round(storage.usedRatio * 100)}%`
              : t("storage.unknown"),
          },
        ]}
      />

      {quiet ? (
        <Card>
          <CardContent className="text-muted-foreground py-8 text-center text-sm">
            {t("admin.inbox.clear")}
          </CardContent>
        </Card>
      ) : null}

      {/* Two columns from the large breakpoint, and never stretched to a
          neighbour's height: an empty queue stays a short card rather than a
          tall blank one. */}
      <div className="grid gap-6 xl:grid-cols-2 xl:items-start">
        {requests.length > 0 ? (
          <Queue
            title={t("admin.inbox.requests", { count: requests.length })}
            href="/admin/requests"
            label={t("admin.nav.requests")}
            more={requests.length - 6}
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
            more={reports.length - 6}
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
            more={tasks.length - 6}
          >
            {tasks.slice(0, 6).map((task) => (
              <Row
                key={task.id}
                main={task.seriesTitle}
                aside={formatEpisodeCode(task.seasonNumber, task.episodeNumber)}
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
      </div>

      <p className="text-muted-foreground text-sm">
        {lastSubmission ? (
          <>
            {t("admin.inbox.lastSubmission")}{" "}
            <span className="text-foreground tabular-nums">
              {formatDateTime(lastSubmission, locale)}
            </span>
          </>
        ) : (
          t("admin.inbox.noSubmission")
        )}
      </p>
    </>
  );
}

function Queue({
  title,
  href,
  label,
  more = 0,
  children,
}: {
  title: string;
  href: string;
  label: string;
  /** Rows the card is not showing. Nothing is drawn when there are none. */
  more?: number;
  children?: React.ReactNode;
}) {
  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <span className="bg-primary size-1.5 rounded-full" aria-hidden />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {children ? (
          <ul className="divide-border/60 -mt-2 divide-y">{children}</ul>
        ) : null}
        <Link
          href={href}
          className="text-muted-foreground hover:text-primary focus-visible:ring-ring/50 mt-3 inline-block rounded-md text-xs transition-colors outline-none focus-visible:ring-3"
        >
          {label}
          {more > 0 ? ` (+${more})` : ""}
        </Link>
      </CardContent>
    </Card>
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
      <span className="min-w-0 flex-1 truncate text-sm">{main}</span>
      {aside ? (
        <Badge variant="outline" className="shrink-0">
          {aside}
        </Badge>
      ) : null}
      <span className="ml-auto flex shrink-0 gap-1.5">{children}</span>
    </li>
  );
}
