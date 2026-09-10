import type { Metadata } from "next";

import { ActionButton } from "@/components/admin/action-button";
import { WaitingList } from "@/components/admin/waiting-list";
import { Pagination } from "@/components/pagination";
import { Poster } from "@/components/poster";
import { Badge } from "@/components/ui/badge";
import { requireStaffPage } from "@/lib/auth/session";
import type { ReportStatus } from "@/lib/db/schema";
import {
  countReports,
  listReports,
  waitingOnReports,
} from "@/lib/domain/reports";
import { formatDate } from "@/lib/format";
import type { TranslationKey } from "@/lib/i18n";
import { getI18n, getTranslator } from "@/lib/i18n/server";
import { paginate, parsePage, toSearchParams } from "@/lib/pagination";
import { nextStatuses } from "@/lib/reports/reasons";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslator();
  return { title: t("meta.admin", { section: t("admin.nav.reports") }) };
}

/** Reports per page, as on the request queue: work read through, not browsed. */
const PER_PAGE = 20;

/**
 * What members have said is wrong.
 *
 * The buttons come from the state machine in `src/lib/reports/reasons.ts`, so a
 * move that is not legal is never offered here and is refused by the domain if
 * it arrives anyway from a stale tab.
 *
 * Taking up a report about a series is also what starts tracking it, which is
 * what lets the sync close it by itself later.
 *
 * A row is one title, place and reason, however many members pointed at it:
 * the row names the first of them and how many others, the whole list one
 * press away.
 *
 * Every move may carry a word for the members waiting on it, which reaches them
 * in their notification and on their follow-up page. Unlike a request, a report
 * keeps that word when it closes: it is where the outcome is read. There is one
 * note per report and never a thread, so writing a new one from the same dialog
 * replaces the one that was there.
 *
 * The queue is read one page at a time, so a year of settled reports is not one
 * screen carrying a thousand rows and their buttons. The count and the slice
 * are two queries rather than one list cut down afterwards: the point is that
 * the rows never come back at all.
 */
export default async function AdminReportsPage({
  searchParams,
}: PageProps<"/admin/reports">) {
  await requireStaffPage();
  const { t, locale } = await getI18n();

  const params = toSearchParams(await searchParams);
  const total = await countReports();
  const page = paginate(total, parsePage(params.get("page")), PER_PAGE);
  const reports = await listReports(undefined, {
    limit: page.perPage,
    offset: page.offset,
  });
  const waiting = await waitingOnReports(reports.map(({ id }) => id));

  if (total === 0)
    return (
      <p className="text-muted-foreground text-sm">{t("admin.reports.none")}</p>
    );

  return (
    <>
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
                <WaitingList
                  names={waiting.get(report.id) ?? []}
                  title={report.media.title}
                  lead=" · "
                />
                {report.libraryRatingKey ? (
                  <span className="font-mono">
                    {" "}
                    · {report.libraryRatingKey}
                  </span>
                ) : null}
              </p>

              {report.adminNote ? (
                <p className="bg-secondary/40 text-muted-foreground rounded-lg px-3 py-2 text-sm">
                  {report.adminNote}
                </p>
              ) : null}

              <div className="flex flex-wrap gap-2 empty:hidden">
                {nextStatuses(report.status).map((status) => (
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
              </div>
            </div>
          </li>
        ))}
      </ul>

      <Pagination
        page={page}
        pathname="/admin/reports"
        params={params}
        label={t("pagination.reports")}
      />
    </>
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
