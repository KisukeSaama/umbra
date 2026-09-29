import type { Metadata } from "next";

import { QueueList } from "@/components/admin/queue-row";
import {
  QueueSelectPage,
  QueueSelection,
} from "@/components/admin/queue-selection";
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
import { listEnabledSearchSites } from "@/lib/domain/search-sites";
import { getI18n, getTranslator } from "@/lib/i18n/server";
import {
  mergePageBy,
  mergeWindow,
  paginate,
  parsePage,
  toSearchParams,
} from "@/lib/pagination";
import {
  QUEUE_STAGES,
  REPORT_STAGE_STATUSES,
  REQUEST_STAGE_STATUSES,
  compareQueueRows,
  countByStage,
  holdsReports,
  parseQueueOrder,
  parseQueueSearch,
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
 * `RequestItem` and `ReportItem`. Rows can also be ticked and moved together,
 * a page at a time: see `QueueSelection`.
 *
 * A search narrows every stage at once, by title, by member or by note: see
 * `queueSearchFilter`.
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
  const stage = parseQueueStage(params.get("stage"));
  const order = parseQueueOrder(params.get("order"), stage);
  const search = parseQueueSearch(params.get("q"));
  const requestStatuses = REQUEST_STAGE_STATUSES[stage];

  // A season asked for is never put off, so the stage of what waits for room
  // holds requests alone.
  const counts = await countByStage(QUEUE_STAGES, async (one) => {
    const [requests, asks] = await Promise.all([
      countRequests(REQUEST_STAGE_STATUSES[one], search),
      holdsReports(one)
        ? countReports(REPORT_STAGE_STATUSES[one], "ask", search)
        : 0,
    ]);
    return requests + asks;
  });
  const page = paginate(counts[stage], parsePage(params.get("page")), PER_PAGE);
  const window = mergeWindow(page);
  const [requestRows, askRows] = await Promise.all([
    listRequests(requestStatuses, window, order, search),
    holdsReports(stage)
      ? listReports(REPORT_STAGE_STATUSES[stage], window, "ask", order, search)
      : [],
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
  const [waiting, waitingOnAsks, searchSites] = await Promise.all([
    waitingOnRequests(requests.map(({ id }) => id)),
    waitingOnReports(asks.map(({ id }) => id)),
    listEnabledSearchSites(),
  ]);

  // An empty queue says so; an empty search keeps its box, to be changed.
  if (counts.all === 0 && !search) {
    return <EmptyNote icon={RequestIcon}>{t("common.empty")}</EmptyNote>;
  }

  const showStatus = stage !== "todo";

  return (
    <>
      <QueueToolbar
        stage={stage}
        order={order}
        search={search}
        stages={QUEUE_STAGES}
        counts={counts}
        pathname="/admin/requests"
        params={params}
        pager={
          <Pagination
            page={page}
            pathname="/admin/requests"
            params={params}
            label={t("pagination.requests")}
            compact
          />
        }
      />

      {entries.length === 0 ? (
        <EmptyNote icon={RequestIcon}>
          {t(search ? "admin.queue.noMatch" : "admin.queue.emptyStage")}
        </EmptyNote>
      ) : (
        <QueueSelection>
          <QueueSelectPage />
          <QueueList>
            {entries.map((entry) =>
              entry.kind === "ask" ? (
                <ReportItem
                  key={entry.ask.id}
                  report={entry.ask}
                  waiting={waitingOnAsks.get(entry.ask.id) ?? []}
                  showStatus={showStatus}
                  searchSites={searchSites}
                  selectable
                />
              ) : (
                <RequestItem
                  key={entry.request.id}
                  request={entry.request}
                  waiting={waiting.get(entry.request.id) ?? []}
                  showStatus={showStatus}
                  searchSites={searchSites}
                  selectable
                />
              ),
            )}
          </QueueList>
        </QueueSelection>
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
