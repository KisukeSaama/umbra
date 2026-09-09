import type { Metadata } from "next";

import { Pagination } from "@/components/pagination";
import { Poster } from "@/components/poster";
import { Timeline } from "@/components/timeline";
import { Badge } from "@/components/ui/badge";
import { WithdrawButton } from "@/components/withdraw-button";
import { requireMemberPage } from "@/lib/auth/session";
import {
  countReportsFollowedBy,
  listReportsFollowedBy,
} from "@/lib/domain/reports";
import { countRequestsBy, listRequestsBy } from "@/lib/domain/requests";
import { formatDate } from "@/lib/format";
import type { TranslationKey } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n/server";
import { paginate, parsePage, toSearchParams } from "@/lib/pagination";
import { isLive } from "@/lib/reports/reasons";

export const metadata: Metadata = { title: "Follow-up" };

/**
 * Entries per section. The two lists page on their own parameter, so stepping
 * back through old requests does not scroll the reports away underneath.
 */
const PER_PAGE = 10;

/**
 * Where a request stops disappearing.
 *
 * Every entry carries its own id, because that is what a notification points
 * at: following a line in the bell lands on the request or the report it is
 * about rather than at the top of the page.
 *
 * Asking for something used to end at "request sent". This page is the other
 * end of that: what you asked for and what you reported, on one screen. The
 * notifications stay in the bell, which is where they are already read: a
 * second copy of the same feed here only made the page longer.
 *
 * It is also where a gesture can be taken back, as long as nobody has acted on
 * it. What "nobody has acted on it" means is decided by the domain; the page
 * only asks whether to draw the button.
 *
 * A request taken in hand, or a report taken up, may carry a word from the
 * administration. It is the only sentence on this page nobody translated, it
 * goes one way, and it is gone once the title is on the server or the problem
 * is fixed, where it has nothing left to say.
 *
 * Both lists only grow: a member who has been here a year has a page of
 * requests nobody rereads. They are cut into pages rather than trimmed, since
 * an old request is exactly what a member comes back to look up.
 */
export default async function ActivityPage({
  searchParams,
}: PageProps<"/activity">) {
  const account = await requireMemberPage();
  const { t, locale } = await getI18n();

  const params = toSearchParams(await searchParams);
  const [requestCount, reportCount] = await Promise.all([
    countRequestsBy(account.id),
    countReportsFollowedBy(account.id),
  ]);

  const requestPage = paginate(
    requestCount,
    parsePage(params.get("requests")),
    PER_PAGE,
  );
  const reportPage = paginate(
    reportCount,
    parsePage(params.get("reports")),
    PER_PAGE,
  );

  const [requests, reports] = await Promise.all([
    listRequestsBy(account.id, {
      limit: requestPage.perPage,
      offset: requestPage.offset,
    }),
    listReportsFollowedBy(account.id, {
      limit: reportPage.perPage,
      offset: reportPage.offset,
    }),
  ]);

  return (
    <div className="umbra-container max-w-6xl space-y-12 py-10">
      <header>
        <h1 className="text-3xl tracking-tight sm:text-4xl">
          {t("activity.title")}
        </h1>
        <p className="text-muted-foreground mt-1">{t("activity.subtitle")}</p>
      </header>

      <section id="requests" className="scroll-mt-[var(--umbra-sticky-top)]">
        <h2 className="mb-4 text-lg font-semibold tracking-tight">
          {t("section.myRequests")}
        </h2>
        {requests.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {t("activity.noRequests")} {t("activity.noRequestsHint")}
          </p>
        ) : (
          <ul className="space-y-3">
            {requests.map((request) => (
              <li
                key={request.id}
                id={request.id}
                className="border-border/60 bg-card/40 flex scroll-mt-[calc(var(--umbra-sticky-top)+0.5rem)] gap-4 rounded-xl border p-3 sm:p-4"
              >
                <div className="w-16 shrink-0 sm:w-20">
                  <Poster
                    src={request.media.posterUrl}
                    alt={request.media.title}
                    sizes="5rem"
                  />
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <p className="font-medium">{request.media.title}</p>
                    {request.media.year ? (
                      <span className="text-muted-foreground text-sm">
                        {request.media.year}
                      </span>
                    ) : null}
                  </div>
                  <Timeline
                    status={request.status}
                    steps={["requested", "accepted", "processing", "available"]}
                    prefix="activity.timeline"
                  />
                  {request.adminNote ? (
                    <p className="border-border/60 border-l-2 pl-3 text-sm">
                      <span className="text-muted-foreground">
                        {t("activity.note")}
                      </span>{" "}
                      {request.adminNote}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <p className="text-muted-foreground text-xs">
                      {t("activity.requestedOn", {
                        date: formatDate(request.createdAt, locale),
                      })}
                    </p>
                    {request.status === "requested" ? (
                      <WithdrawButton
                        endpoint={`/api/requests/${request.id}`}
                        label="title.cancelRequest"
                        done="status.requestCancelled"
                      />
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        <Pagination
          page={requestPage}
          pathname="/activity"
          params={params}
          paramKey="requests"
          hash="requests"
          label={t("pagination.requests")}
        />
      </section>

      <section id="reports" className="scroll-mt-[var(--umbra-sticky-top)]">
        <h2 className="mb-4 text-lg font-semibold tracking-tight">
          {t("section.myReports")}
        </h2>
        {reports.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {t("report.none")} {t("report.noneHint")}
          </p>
        ) : (
          <ul className="divide-border/60 divide-y">
            {reports.map((report) => (
              <li
                key={report.id}
                id={report.id}
                className="flex scroll-mt-[calc(var(--umbra-sticky-top)+0.5rem)] flex-wrap items-baseline gap-x-3 gap-y-1 py-3"
              >
                <p className="font-medium">{report.media.title}</p>
                <span className="text-muted-foreground text-sm">
                  {t(`report.reason.${report.reason}` as TranslationKey)}
                  {report.seasonNumber !== null
                    ? ` · ${t("report.season", { number: report.seasonNumber })}`
                    : ""}
                  {report.episodeNumber !== null
                    ? ` · ${t("report.episode", { number: report.episodeNumber })}`
                    : ""}
                </span>
                <Badge
                  variant={
                    report.status === "resolved"
                      ? "secondary"
                      : report.status === "rejected" ||
                          report.status === "duplicate"
                        ? "outline"
                        : "default"
                  }
                  className="ml-auto"
                >
                  {t(`report.status.${report.status}` as TranslationKey)}
                </Badge>
                {report.adminNote ? (
                  <p className="border-border/60 w-full border-l-2 pl-3 text-sm">
                    <span className="text-muted-foreground">
                      {t("activity.note")}
                    </span>{" "}
                    {report.adminNote}
                  </p>
                ) : null}
                <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-1">
                  <p className="text-muted-foreground text-xs">
                    {t("report.reportedOn", {
                      date: formatDate(report.createdAt, locale),
                    })}
                  </p>
                  {isLive(report.status) ? (
                    <WithdrawButton
                      endpoint={`/api/reports/${report.id}`}
                      label="report.withdraw"
                      done="status.reportWithdrawn"
                    />
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}

        <Pagination
          page={reportPage}
          pathname="/activity"
          params={params}
          paramKey="reports"
          hash="reports"
          label={t("pagination.reports")}
        />
      </section>
    </div>
  );
}
