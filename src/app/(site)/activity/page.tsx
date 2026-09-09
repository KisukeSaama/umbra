import type { Metadata } from "next";

import { Poster } from "@/components/poster";
import { Timeline } from "@/components/timeline";
import { Badge } from "@/components/ui/badge";
import { requireMemberPage } from "@/lib/auth/session";
import { listNotifications } from "@/lib/domain/notifications";
import { listReportsFollowedBy } from "@/lib/domain/reports";
import { listRequestsBy } from "@/lib/domain/requests";
import { formatDate } from "@/lib/format";
import type { TranslationKey } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Follow-up" };

/**
 * Where a request stops disappearing.
 *
 * Asking for something used to end at "request sent". This page is the other
 * end of that: what you asked for, what you reported, and what has moved since
 * you last looked, on one screen.
 *
 * The timelines are drawn from the timestamps on the rows themselves, not from
 * the notification feed. Notifications are pruned; a follow-up must not quietly
 * shorten as it ages.
 */
export default async function ActivityPage() {
  const account = await requireMemberPage();
  const { t, locale } = await getI18n();

  const [requests, reports, moved] = await Promise.all([
    listRequestsBy(account.id),
    listReportsFollowedBy(account.id),
    listNotifications(account.id, 20),
  ]);

  return (
    <div className="umbra-container max-w-4xl space-y-12 py-10">
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
                  <p className="text-muted-foreground text-xs">
                    {t("activity.requestedOn", {
                      date: formatDate(request.createdAt, locale),
                    })}
                  </p>
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
                <p className="text-muted-foreground w-full text-xs">
                  {t("report.reportedOn", {
                    date: formatDate(report.createdAt, locale),
                  })}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold tracking-tight">
          {t("section.whatMoved")}
        </h2>
        {moved.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {t("activity.nothingMoved")}
          </p>
        ) : (
          <ul className="divide-border/60 divide-y">
            {moved.map((entry) => (
              <li key={entry.id} className="flex items-baseline gap-3 py-2.5">
                <span className="text-sm">
                  {entry.payload.title ?? t("common.empty")}
                </span>
                <time
                  dateTime={entry.createdAt.toISOString()}
                  className="text-muted-foreground ml-auto text-xs"
                >
                  {formatDate(entry.createdAt, locale)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
