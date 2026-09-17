import type { Metadata } from "next";
import Link from "next/link";

import { ActionButton } from "@/components/admin/action-button";
import { StatStrip } from "@/components/admin/stat-strip";
import { formatPercent } from "@/components/formatting";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireStaffPage } from "@/lib/auth/session";
import {
  lastReportAt,
  listReports,
  type ReportRow,
} from "@/lib/domain/reports";
import {
  LIVE_REQUEST_STATUSES,
  lastRequestAt,
  listRequests,
  type RequestRow,
} from "@/lib/domain/requests";
import { seasonGap } from "@/lib/domain/season-gap";
import { listOpenEpisodeTasks } from "@/lib/domain/series";
import { storageOverview } from "@/lib/domain/storage";
import { formatDateTime, formatEpisodeCode } from "@/lib/format";
import type { TranslationKey } from "@/lib/i18n";
import { getI18n, getTranslator } from "@/lib/i18n/server";
import {
  LIVE_REPORT_STATUSES,
  canTransition,
  reasonKey,
} from "@/lib/reports/reasons";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslator();
  return { title: t("meta.admin", { section: t("admin.nav.dashboard") }) };
}

/**
 * The dashboard.
 *
 * Two readings, in this order. A strip of figures, so the state of the place is
 * one glance rather than four visits, then the queues themselves: everything
 * waiting on a decision, in the order it arrived, with the decision available
 * on the row rather than three pages away.
 *
 * A queue holds what is live, which for a request means taken in hand as well
 * as new. Accepting one used to remove it from here, so the work left the desk
 * the moment it started and the next move on it had to be gone looking for. A
 * report has always stayed until it closed, and the two are one queue read
 * twice: what leaves is what is settled.
 *
 * The figures are counts of work, never a scoreboard: no trend arrow, no
 * gauge, and nothing about whether the server is up. If Umbra answered, it is.
 *
 * When every queue is empty the page says so and stops, which is the only
 * honest thing a page like this can do on a quiet day.
 */
export default async function AdminDashboardPage() {
  await requireStaffPage();
  const { t, locale } = await getI18n();

  const [requests, asks, reports, tasks, storage, latestRequest, latestReport] =
    await Promise.all([
      listRequests([...LIVE_REQUEST_STATUSES], undefined, "recent"),
      listReports([...LIVE_REPORT_STATUSES], undefined, "ask", "recent"),
      listReports([...LIVE_REPORT_STATUSES], undefined, "fault", "recent"),
      listOpenEpisodeTasks(),
      storageOverview(),
      lastRequestAt(),
      lastReportAt(),
    ]);

  // A season asked for is filed as a report and listed with the requests, as
  // on the request queue and on the member's follow-up page.
  const asked = [
    ...requests.map((request) => ({ kind: "request" as const, request })),
    ...asks.map((ask) => ({ kind: "ask" as const, ask })),
  ].sort(
    (left, right) => createdAt(right).getTime() - createdAt(left).getTime(),
  );

  const quiet =
    asked.length === 0 && reports.length === 0 && tasks.length === 0;

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
          { label: t("admin.stat.requests"), value: asked.length },
          { label: t("admin.stat.reports"), value: reports.length },
          { label: t("admin.stat.episodes"), value: tasks.length },
          {
            label: t("section.storage"),
            value: storage
              ? formatPercent(storage.usedRatio, locale)
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
        {asked.length > 0 ? (
          <Queue
            title={t("admin.inbox.requests", { count: asked.length })}
            href="/admin/requests"
            label={t("admin.nav.requests")}
            more={asked.length - 6}
          >
            {asked.slice(0, 6).map((entry) => {
              if (entry.kind === "ask")
                return <ReportQueueRow key={entry.ask.id} report={entry.ask} />;
              const { request } = entry;
              return (
                <Row
                  key={request.id}
                  main={request.media.title}
                  waiting={request.waiting}
                  aside={
                    request.status === "requested" && request.reasked
                      ? t("admin.requests.reasked")
                      : request.status === "requested"
                      ? request.media.year
                        ? String(request.media.year)
                        : undefined
                      : t(
                          `admin.requests.status.${request.status}` as TranslationKey,
                        )
                  }
                >
                  {request.status === "requested" ? (
                    <>
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
                    </>
                  ) : null}
                </Row>
              );
            })}
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
              <ReportQueueRow key={report.id} report={report} />
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

function createdAt(
  entry:
    { kind: "request"; request: RequestRow } | { kind: "ask"; ask: ReportRow },
) {
  return entry.kind === "request"
    ? entry.request.createdAt
    : entry.ask.createdAt;
}

/** A live report on the desk, fault or ask, with the one move that comes next. */
async function ReportQueueRow({ report }: { report: ReportRow }) {
  const t = await getTranslator();
  const gap = await seasonGap(report);
  return (
    <Row
      main={report.media.title}
      waiting={report.waiting}
      aside={
        gap && gap.missing > 0
          ? `${t("report.toFetch", { count: gap.missing })} · ${gap.codes}`
          : t(reasonKey(report))
      }
    >
      {report.status === "open" ? (
        <ActionButton
          url={`/api/admin/reports/${report.id}`}
          body={{ status: "acknowledged" }}
          size="xs"
        >
          {t("admin.reports.acknowledge")}
        </ActionButton>
      ) : canTransition(report.status, "resolved", report.reason) ? (
        <ActionButton
          url={`/api/admin/reports/${report.id}`}
          body={{ status: "resolved" }}
          size="xs"
        >
          {t("admin.reports.resolve")}
        </ActionButton>
      ) : null}
    </Row>
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
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {children ? (
          <ul className="divide-border/60 -mt-2 divide-y">{children}</ul>
        ) : null}
        <Link
          href={href}
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 mt-3 inline-block rounded-md text-xs transition-colors outline-none focus-visible:ring-3"
        >
          {label}
          {more > 0 ? ` (+${more})` : ""}
        </Link>
      </CardContent>
    </Card>
  );
}

async function Row({
  main,
  aside,
  waiting = 1,
  children,
}: {
  main: string;
  aside?: string;
  /** Members waiting on the row. Said only when it is more than one. */
  waiting?: number;
  children?: React.ReactNode;
}) {
  const t = await getTranslator();
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2">
      <span className="min-w-0 flex-1 truncate text-sm">{main}</span>
      {waiting > 1 ? (
        <Badge variant="secondary" className="shrink-0">
          {t("admin.waiting", { count: waiting })}
        </Badge>
      ) : null}
      {aside ? (
        <Badge variant="outline" className="shrink-0">
          {aside}
        </Badge>
      ) : null}
      <span className="ml-auto flex shrink-0 gap-1.5">{children}</span>
    </li>
  );
}
