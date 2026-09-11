import type { Metadata } from "next";

import { ActionButton } from "@/components/admin/action-button";
import { ReportItem } from "@/components/admin/report-item";
import { WaitingList } from "@/components/admin/waiting-list";
import { EmptyNote } from "@/components/empty-note";
import { RequestIcon } from "@/components/icons";
import { Pagination } from "@/components/pagination";
import { Poster } from "@/components/poster";
import { Badge } from "@/components/ui/badge";
import type { RequestStatus } from "@/lib/db/schema";
import {
  countReports,
  listReports,
  waitingOnReports,
  type ReportRow,
} from "@/lib/domain/reports";
import {
  canCarryNote,
  canMoveRequest,
  countRequests,
  listRequests,
  waitingOnRequests,
  type RequestRow,
} from "@/lib/domain/requests";
import { formatDate } from "@/lib/format";
import type { TranslationKey } from "@/lib/i18n";
import { requireStaffPage } from "@/lib/auth/session";
import { getI18n, getTranslator } from "@/lib/i18n/server";
import {
  mergePage,
  mergeWindow,
  paginate,
  parsePage,
  toSearchParams,
} from "@/lib/pagination";

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
 * Requests, newest first.
 *
 * A row is one title, however many members want it: a second ask joins the
 * first, and the row names who is waiting: the first of them and how many
 * others, the whole list one press away.
 * Every move and every word on it reaches all of them.
 *
 * Accepting a series is also what starts its tracking, so the buttons here are
 * the entry point of the whole episode pipeline.
 *
 * Accepting may carry an optional word for the person who asked, which reaches
 * them in their notification and on their follow-up page and is erased the day
 * the title lands on the server. That word can be rewritten afterwards, from
 * the same dialog, for as long as it is still displayed: what was being looked
 * for changes, and saying so should not mean moving the request.
 *
 * The queue is read one page at a time. Nothing is dropped off the end: a
 * settled request is what the administration comes back to look up, so the
 * older ones move one step further back, at an address that can be shared.
 *
 * A season or an episode asked for is listed here too, interleaved by date, as
 * it is on the member's follow-up page: it is filed as a report and keeps the
 * report's buttons, but the member asked for it, and listing it with the
 * reports had the two sides disagreeing about what the same row was.
 */
export default async function AdminRequestsPage({
  searchParams,
}: PageProps<"/admin/requests">) {
  await requireStaffPage();
  const { t, locale } = await getI18n();

  const params = toSearchParams(await searchParams);
  const [requestCount, askCount] = await Promise.all([
    countRequests(),
    countReports(undefined, "ask"),
  ]);
  const page = paginate(
    requestCount + askCount,
    parsePage(params.get("page")),
    PER_PAGE,
  );
  const window = mergeWindow(page);
  const [requestRows, askRows] = await Promise.all([
    listRequests(undefined, window),
    listReports(undefined, window, "ask"),
  ]);
  const entries = mergePage<Entry>(
    page,
    [
      requestRows.map((request) => ({ kind: "request" as const, request })),
      askRows.map((ask) => ({ kind: "ask" as const, ask })),
    ],
    (entry) =>
      entry.kind === "request" ? entry.request.createdAt : entry.ask.createdAt,
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

  if (entries.length === 0) {
    return <EmptyNote icon={RequestIcon}>{t("common.empty")}</EmptyNote>;
  }

  return (
    <>
      <ul className="space-y-3">
        {entries.map((entry) => {
          if (entry.kind === "ask")
            return (
              <ReportItem
                key={entry.ask.id}
                report={entry.ask}
                waiting={waitingOnAsks.get(entry.ask.id) ?? []}
              />
            );
          const { request } = entry;
          return (
            <li
              key={request.id}
              className="border-border/60 bg-card/40 flex gap-4 rounded-xl border p-3 sm:p-4"
            >
              <div className="w-16 shrink-0">
                <Poster
                  src={request.media.posterUrl}
                  alt={request.media.title}
                  sizes="4rem"
                />
              </div>

              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <p className="font-medium">{request.media.title}</p>
                  {request.media.year ? (
                    <span className="text-muted-foreground text-sm">
                      {request.media.year}
                    </span>
                  ) : null}
                  <Badge variant="outline">
                    {request.media.kind === "movie"
                      ? t("common.movie")
                      : t("common.series")}
                  </Badge>
                  <Badge variant={statusVariant(request.status)}>
                    {t(
                      `admin.requests.status.${request.status}` as TranslationKey,
                    )}
                  </Badge>
                </div>

                <p className="text-muted-foreground text-xs">
                  {formatDate(request.createdAt, locale)}
                  <WaitingList
                    names={waiting.get(request.id) ?? []}
                    title={request.media.title}
                    lead=" · "
                  />
                </p>

                {request.adminNote ? (
                  <p className="bg-secondary/40 text-muted-foreground rounded-lg px-3 py-2 text-sm">
                    {request.adminNote}
                  </p>
                ) : null}

                <div className="flex flex-wrap gap-2 empty:hidden">
                  {nextActions(request.status).map(
                    (action) => (
                      <ActionButton
                        key={action.status}
                        url={`/api/admin/requests/${request.id}`}
                        body={{ status: action.status }}
                        size="sm"
                        variant={action.variant}
                        noteField={
                          action.note
                            ? {
                                name: "adminNote",
                                label: t("admin.requests.note"),
                                placeholder: t(
                                  "admin.requests.notePlaceholder",
                                ),
                                defaultValue: request.adminNote,
                              }
                            : undefined
                        }
                      >
                        {t(action.labelKey)}
                      </ActionButton>
                    ),
                  )}

                  {canEditNote(request.status) ? (
                    <ActionButton
                      url={`/api/admin/requests/${request.id}`}
                      body={{}}
                      size="sm"
                      variant="ghost"
                      noteField={{
                        name: "adminNote",
                        label: t("admin.requests.note"),
                        placeholder: t("admin.requests.notePlaceholder"),
                        defaultValue: request.adminNote,
                      }}
                    >
                      {t(
                        request.adminNote
                          ? "admin.requests.editNote"
                          : "admin.requests.addNote",
                      )}
                    </ActionButton>
                  ) : null}
                </div>

                {waitingOnLibrary(request.status, request.inLibrary) ? (
                  <p className="text-muted-foreground text-xs">
                    {t("admin.requests.awaitingLibrary")}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

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

/**
 * A note can be written on its own once the ask has been taken in hand.
 *
 * Not on a new one: there the word belongs to the acceptance dialog, and a
 * second button offering the same box before any decision is made would say
 * something to the member without answering them.
 */
function canEditNote(status: RequestStatus) {
  return status !== "requested" && canCarryNote(status);
}

/** New asks for attention; settled states are quiet, and a refusal is not an error. */
function statusVariant(status: RequestStatus) {
  switch (status) {
    case "requested":
      return "default";
    case "rejected":
      return "outline";
    default:
      return "secondary";
  }
}

/**
 * A request being fetched, whose title the server does not hold yet.
 *
 * Said rather than left blank: nothing is left for the administration to press,
 * because the sync closes the request once the title is on the server.
 */
function waitingOnLibrary(status: RequestStatus, inLibrary: boolean) {
  return !inLibrary && status === "accepted";
}

/** One move as this screen offers it: a label, a weight, and whether it talks. */
type RequestAction = {
  status: RequestStatus;
  labelKey: TranslationKey;
  variant: "default" | "secondary" | "ghost";
  /** Taking an ask in hand is the one move that may carry a word back. */
  note?: boolean;
};

/**
 * The moves this screen puts on a row, before the domain has its say.
 *
 * It is a choice of what to offer, not a statement of what is legal: the
 * lifecycle lives in `src/lib/domain/requests.ts` and is checked below. A new
 * request is accepted or refused here and nothing else, because accepting is
 * what starts tracking a series. Accepted means being fetched, and what follows
 * is the title reaching the server, which the sync records on its own.
 */
const OFFERED = {
  requested: [
    {
      status: "accepted",
      labelKey: "admin.requests.accept",
      variant: "default",
      note: true,
    },
    {
      status: "rejected",
      labelKey: "admin.requests.reject",
      variant: "ghost",
    },
  ],
  accepted: [],
  available: [],
  rejected: [],
} satisfies Record<RequestStatus, RequestAction[]>;

/**
 * What the row actually shows.
 *
 * The page used to hold its own idea of which move followed which, which is a
 * second copy of a rule that has an owner: `canMoveRequest` is the one the API
 * answers with, so anything it refuses is filtered out here rather than
 * offered and then met with a 409 from a button that looked live.
 */
function nextActions(status: RequestStatus): RequestAction[] {
  return OFFERED[status].filter((action) =>
    canMoveRequest(status, action.status),
  );
}
