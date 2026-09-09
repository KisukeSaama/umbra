import type { Metadata } from "next";

import { Poster } from "@/components/poster";
import { Timeline } from "@/components/timeline";
import { Badge } from "@/components/ui/badge";
import { WithdrawButton } from "@/components/withdraw-button";
import { requireMemberPage } from "@/lib/auth/session";
import { listReportsFollowedBy } from "@/lib/domain/reports";
import { listRequestsBy } from "@/lib/domain/requests";
import { formatDate } from "@/lib/format";
import type { TranslationKey } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n/server";
import { isLive } from "@/lib/reports/reasons";

export const metadata: Metadata = { title: "Follow-up" };

/**
 * Where a request stops disappearing.
 *
 * Asking for something used to end at "request sent". This page is the other
 * end of that: what you asked for and what you reported, on one screen. The
 * notifications stay in the bell, which is where they are already read: a
 * second copy of the same feed here only made the page longer.
 *
 * It is also where a gesture can be taken back, as long as nobody has acted on
 * it. What "nobody has acted on it" means is decided by the domain; the page
 * only asks whether to draw the button.
 */
export default async function ActivityPage() {
  const account = await requireMemberPage();
  const { t, locale } = await getI18n();

  const [requests, reports] = await Promise.all([
    listRequestsBy(account.id),
    listReportsFollowedBy(account.id),
  ]);

  return (
    <div className="umbra-container max-w-6xl space-y-12 py-10">
      <header>
        <h1 className="text-3xl tracking-tight sm:text-4xl">
          {t("activity.title")}
        </h1>
        <p className="text-muted-foreground mt-1">{t("activity.subtitle")}</p>
      </header>

      <section>
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
                className="border-border/60 bg-card/40 flex gap-4 rounded-xl border p-3 sm:p-4"
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
      </section>

      <section>
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
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3"
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
      </section>
    </div>
  );
}
