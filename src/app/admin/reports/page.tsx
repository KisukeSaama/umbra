import { ActionButton } from "@/components/admin/action-button";
import { Poster } from "@/components/poster";
import { Badge } from "@/components/ui/badge";
import { requireStaffPage } from "@/lib/auth/session";
import type { ReportStatus } from "@/lib/db/schema";
import { listReports } from "@/lib/domain/reports";
import { formatDate } from "@/lib/format";
import type { TranslationKey } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n/server";
import { nextStatuses } from "@/lib/reports/reasons";

/**
 * What members have said is wrong.
 *
 * The buttons come from the state machine in `src/lib/reports/reasons.ts`, so a
 * move that is not legal is never offered here and is refused by the domain if
 * it arrives anyway from a stale tab.
 *
 * Taking up a report about a series is also what starts tracking it, which is
 * what lets the sync close it by itself later.
 */
export default async function AdminReportsPage() {
  await requireStaffPage();
  const { t, locale } = await getI18n();
  const reports = await listReports();

  if (reports.length === 0)
    return (
      <p className="text-muted-foreground text-sm">{t("admin.reports.none")}</p>
    );

  return (
    <ul className="space-y-3">
      {reports.map((report) => (
        <li
          key={report.id}
          className="border-border/60 bg-card/40 flex gap-4 rounded-xl border p-3 sm:p-4"
        >
          <div className="w-16 shrink-0">
            <Poster
              src={report.media.posterUrl}
              alt={report.media.title}
              sizes="4rem"
            />
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <p className="font-medium">{report.media.title}</p>
              <span className="text-muted-foreground text-sm">
                {place(report.seasonNumber, report.episodeNumber, t)}
              </span>
              <Badge variant={statusVariant(report.status)}>
                {t(`report.status.${report.status}` as TranslationKey)}
              </Badge>
            </div>

            <p className="text-sm">
              {t(`report.reason.${report.reason}` as TranslationKey)}
            </p>

            <p className="text-muted-foreground text-xs">
              {formatDate(report.createdAt, locale)}
              {report.reportedBy ? ` · ${report.reportedBy}` : ""}
              {report.libraryRatingKey ? (
                <span className="font-mono"> · {report.libraryRatingKey}</span>
              ) : null}
            </p>

            {nextStatuses(report.status).length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {nextStatuses(report.status).map((status) => (
                  <ActionButton
                    key={status}
                    url={`/api/admin/reports/${report.id}`}
                    body={{ status }}
                    size="sm"
                    variant={actionVariant(status)}
                  >
                    {t(actionLabel(status))}
                  </ActionButton>
                ))}
              </div>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Where the member pointed, in the same words they were given. */
function place(
  seasonNumber: number | null,
  episodeNumber: number | null,
  t: (key: TranslationKey, values?: Record<string, string | number>) => string,
) {
  if (episodeNumber !== null && seasonNumber !== null)
    return `${t("report.season", { number: seasonNumber })} · ${t("report.episode", { number: episodeNumber })}`;
  if (seasonNumber !== null)
    return t("report.season", { number: seasonNumber });
  return t("report.wholeSeries");
}

/** Open asks for attention; a settled state is quiet, and a refusal is not an error. */
function statusVariant(status: ReportStatus) {
  if (status === "open") return "default" as const;
  if (status === "rejected" || status === "duplicate")
    return "outline" as const;
  return "secondary" as const;
}

function actionLabel(status: ReportStatus): TranslationKey {
  switch (status) {
    case "acknowledged":
      return "admin.reports.acknowledge";
    case "in_progress":
      return "admin.reports.start";
    case "resolved":
      return "admin.reports.resolve";
    case "duplicate":
      return "admin.reports.duplicate";
    default:
      return "admin.reports.reject";
  }
}

function actionVariant(status: ReportStatus) {
  if (status === "acknowledged" || status === "resolved")
    return "default" as const;
  if (status === "rejected" || status === "duplicate") return "ghost" as const;
  return "secondary" as const;
}
