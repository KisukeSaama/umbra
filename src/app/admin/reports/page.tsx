import type { Metadata } from "next";

import { ReportItem } from "@/components/admin/report-item";
import { EmptyNote } from "@/components/empty-note";
import { FlagIcon } from "@/components/icons";
import { Pagination } from "@/components/pagination";
import { requireStaffPage } from "@/lib/auth/session";
import {
  countReports,
  listReports,
  waitingOnReports,
} from "@/lib/domain/reports";
import { getI18n, getTranslator } from "@/lib/i18n/server";
import { paginate, parsePage, toSearchParams } from "@/lib/pagination";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslator();
  return { title: t("meta.admin", { section: t("admin.nav.reports") }) };
}

/** Reports per page, as on the request queue: work read through, not browsed. */
const PER_PAGE = 20;

/**
 * What members have said is wrong.
 *
 * Faults only: a season or an episode asked for is filed as a report but was a
 * request from the member's side, and it is listed with the requests, as it is
 * on their follow-up page.
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
  const { t } = await getI18n();

  const params = toSearchParams(await searchParams);
  const total = await countReports(undefined, "fault");
  const page = paginate(total, parsePage(params.get("page")), PER_PAGE);
  const reports = await listReports(
    undefined,
    { limit: page.perPage, offset: page.offset },
    "fault",
  );
  const waiting = await waitingOnReports(reports.map(({ id }) => id));

  if (total === 0)
    return <EmptyNote icon={FlagIcon}>{t("admin.reports.none")}</EmptyNote>;

  return (
    <>
      <ul className="space-y-3">
        {reports.map((report) => (
          <ReportItem
            key={report.id}
            report={report}
            waiting={waiting.get(report.id) ?? []}
          />
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
