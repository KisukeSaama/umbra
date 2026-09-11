import type { Metadata } from "next";

import { QueueList } from "@/components/admin/queue-row";
import { QueueToolbar } from "@/components/admin/queue-toolbar";
import { ReportItem } from "@/components/admin/report-item";
import { RequestItem } from "@/components/admin/request-item";
import { EmptyNote } from "@/components/empty-note";
import { RequestIcon } from "@/components/icons";
import { Pagination } from "@/components/pagination";
import { requireStaffPage } from "@/lib/auth/session";
import {
  countReports,
  listReports,
  waitingOnReports,
  type ReportRow,
} from "@/lib/domain/reports";
import {
  countRequests,
  listRequests,
  waitingOnRequests,
  type RequestRow,
} from "@/lib/domain/requests";
import { getI18n, getTranslator } from "@/lib/i18n/server";
import {
  mergePageBy,
  mergeWindow,
  paginate,
  parsePage,
  toSearchParams,
} from "@/lib/pagination";
import {
  REPORT_STAGE_STATUSES,
  REQUEST_STAGE_STATUSES,
  compareQueueRows,
  countByStage,
  parseQueueOrder,
  parseQueueStage,
} from "@/lib/queue";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslator();
  return { title: t("meta.admin", { section: t("admin.nav.requests") }) };
}

/**
 * Requests per page.
 *
 * Longer than a feed on the member side: this is a queue somebody works
 * through rather than a page somebody browses, and every row carries buttons
 * that are client components. A year of history on one screen was hundreds of
 * them mounted at once.
 */
const PER_PAGE = 20;

/**
 * Requests, cut by stage and opening on those waiting for a decision.
 *
 * The rows themselves, and what each move does, are described in
 * `RequestItem` and `ReportItem`.
 *
 * The queue is read one page at a time. Nothing is dropped off the end: a
 * settled request is what the administration comes back to look up, so it sits
 * under its own stage rather than between two new ones, at an address that can
 * be shared.
 *
 * A season or an episode asked for is listed here too, interleaved with the
 * requests, as it is on the member's follow-up page: it is filed as a report
 * and keeps the report's buttons, but the member asked for it, and listing it
 * with the reports had the two sides disagreeing about what the same row was.
 */
export default async function AdminRequestsPage({
  searchParams,
}: PageProps<"/admin/requests">) {
  await requireStaffPage();
  const { t } = await getI18n();

  const params = toSearchParams(await searchParams);
  const order = parseQueueOrder(params.get("order"));
  const stage = parseQueueStage(params.get("stage"));
  const requestStatuses = REQUEST_STAGE_STATUSES[stage];
  const askStatuses = REPORT_STAGE_STATUSES[stage];

  const counts = await countByStage(async (one) => {
    const [requests, asks] = await Promise.all([
      countRequests(REQUEST_STAGE_STATUSES[one]),
      countReports(REPORT_STAGE_STATUSES[one], "ask"),
    ]);
    return requests + asks;
  });
  const page = paginate(
    counts[stage],
    parsePage(params.get("page")),
    PER_PAGE,
  );
  const window = mergeWindow(page);
  const [requestRows, askRows] = await Promise.all([
    listRequests(requestStatuses, window, order),
    listReports(askStatuses, window, "ask", order),
  ]);
  const compare = compareQueueRows(order);
  const entries = mergePageBy<Entry>(
    page,
    [
      requestRows.map((request) => ({ kind: "request" as const, request })),
      askRows.map((ask) => ({ kind: "ask" as const, ask })),
    ],
    (left, right) => compare(rowOf(left), rowOf(right)),
  );
  const requests = entries.flatMap((entry) =>
    entry.kind === "request" ? [entry.request] : [],
  );
  const asks = entries.flatMap((entry) =>
    entry.kind === "ask" ? [entry.ask] : [],
  );
  const [waiting, waitingOnAsks] = await Promise.all([
    waitingOnRequests(requests.map(({ id }) => id)),
    waitingOnReports(asks.map(({ id }) => id)),
  ]);

  if (counts.all === 0) {
    return <EmptyNote icon={RequestIcon}>{t("common.empty")}</EmptyNote>;
  }

  const showStatus = stage !== "todo";

  return (
    <>
      <QueueToolbar
        stage={stage}
        order={order}
        counts={counts}
        pathname="/admin/requests"
        params={params}
      />

      {entries.length === 0 ? (
        <EmptyNote icon={RequestIcon}>{t("admin.queue.emptyStage")}</EmptyNote>
      ) : (
        <QueueList>
          {entries.map((entry) =>
            entry.kind === "ask" ? (
              <ReportItem
                key={entry.ask.id}
                report={entry.ask}
                waiting={waitingOnAsks.get(entry.ask.id) ?? []}
                showStatus={showStatus}
              />
            ) : (
              <RequestItem
                key={entry.request.id}
                request={entry.request}
                waiting={waiting.get(entry.request.id) ?? []}
                showStatus={showStatus}
              />
            ),
          )}
        </QueueList>
      )}

      <Pagination
        page={page}
        pathname="/admin/requests"
        params={params}
        label={t("pagination.requests")}
      />
    </>
  );
}

/** One row of the queue, whichever table it came out of. */
type Entry =
  { kind: "request"; request: RequestRow } | { kind: "ask"; ask: ReportRow };

function rowOf(entry: Entry): RequestRow | ReportRow {
  return entry.kind === "request" ? entry.request : entry.ask;
}
