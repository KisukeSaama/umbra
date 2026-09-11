import { ActionButton } from "@/components/admin/action-button";
import { QueueRow } from "@/components/admin/queue-row";
import { WaitingList } from "@/components/admin/waiting-list";
import { Badge } from "@/components/ui/badge";
import type { ReportStatus } from "@/lib/db/schema";
import type { ReportRow } from "@/lib/domain/reports";
import { seasonGap } from "@/lib/domain/season-gap";
import { formatDate } from "@/lib/format";
import type { TranslationKey } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n/server";
import { nextStatuses, reasonKey } from "@/lib/reports/reasons";

/**
 * One report row as the administration works it.
 *
 * Shared by the report queue, which holds the faults, and the request queue,
 * which holds the asks: a season asked for is filed as a report and keeps the
 * report lifecycle, whichever heading it is listed under.
 *
 * The buttons come from the state machine in `src/lib/reports/reasons.ts`, so a
 * move that is not legal is never offered here and is refused by the domain if
 * it arrives anyway from a stale tab.
 */
export async function ReportItem({
  report,
  waiting,
  showStatus = true,
}: {
  report: ReportRow;
  /** Who is waiting on it, by name, the first being whoever reported first. */
  waiting: string[];
  /** Left out where the stage shown holds a single status. */
  showStatus?: boolean;
}) {
  const { t, locale } = await getI18n();
  const gap = await seasonGap(report);

  return (
    <QueueRow
      poster={{ src: report.media.posterUrl, alt: report.media.title }}
      heading={
        <>
          <p className="font-medium">{report.media.title}</p>
          <span className="text-muted-foreground text-sm">
            {place(report.seasonNumber, report.episodeNumber, t)}
          </span>
          {showStatus ? (
            <Badge variant={statusVariant(report.status)}>
              {t(`report.status.${report.status}` as TranslationKey)}
            </Badge>
          ) : null}
        </>
      }
      detail={
        <>
          {/* The gap in files, when there is one to measure: what to fetch
              first, then where the season stands. Otherwise the reason. */}
          {gap && gap.missing > 0 ? (
            <>
              {t("report.toFetch", { count: gap.missing })}
              {" · "}
              <span className="font-mono">{gap.codes}</span>
              <span className="text-muted-foreground">
                {" · "}
                {t("report.heldOf", { held: gap.held, aired: gap.aired })}
              </span>
            </>
          ) : (
            <>
              {t(reasonKey(report))}
              {gap ? (
                <span className="text-muted-foreground">
                  {" · "}
                  {t("report.onServer", { count: gap.held })}
                </span>
              ) : null}
            </>
          )}
        </>
      }
      meta={
        <>
          {formatDate(report.createdAt, locale)}
          <WaitingList names={waiting} title={report.media.title} lead=" · " />
          {report.libraryRatingKey ? (
            <span className="font-mono"> · {report.libraryRatingKey}</span>
          ) : null}
        </>
      }
      note={report.adminNote}
      actions={
        <>
          {nextStatuses(report.status, report.reason).map((status) => (
            <ActionButton
              key={status}
              url={`/api/admin/reports/${report.id}`}
              body={{ status }}
              size="sm"
              variant={actionVariant(status)}
              noteField={{
                name: "adminNote",
                label: t("admin.reports.note"),
                placeholder: t("admin.reports.notePlaceholder"),
                defaultValue: report.adminNote,
              }}
            >
              {t(actionLabel(status))}
            </ActionButton>
          ))}

          {canEditNote(report.status) ? (
            <ActionButton
              url={`/api/admin/reports/${report.id}`}
              body={{}}
              size="sm"
              variant="ghost"
              noteField={{
                name: "adminNote",
                label: t("admin.reports.note"),
                placeholder: t("admin.reports.notePlaceholder"),
                defaultValue: report.adminNote,
              }}
            >
              {t(
                report.adminNote
                  ? "admin.reports.editNote"
                  : "admin.reports.addNote",
              )}
            </ActionButton>
          ) : null}
        </>
      }
    />
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

/**
 * A note can be written on its own once the report has been taken up.
 *
 * Not while it is open: there the word belongs to the take-up dialog, and a
 * second button offering the same box before any decision is made would say
 * something to the members without answering them. Closed reports keep the
 * button: their note is the outcome, and an outcome can be worded better.
 */
function canEditNote(status: ReportStatus) {
  return status !== "open";
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
