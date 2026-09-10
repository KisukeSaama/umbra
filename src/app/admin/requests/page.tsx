import type { Metadata } from "next";

import { ActionButton } from "@/components/admin/action-button";
import { WaitingList } from "@/components/admin/waiting-list";
import { Pagination } from "@/components/pagination";
import { Poster } from "@/components/poster";
import { Badge } from "@/components/ui/badge";
import type { RequestStatus } from "@/lib/db/schema";
import {
  canCarryNote,
  canMoveRequest,
  countRequests,
  listRequests,
  waitingOnRequests,
} from "@/lib/domain/requests";
import { formatDate } from "@/lib/format";
import type { TranslationKey } from "@/lib/i18n";
import { requireStaffPage } from "@/lib/auth/session";
import { getI18n, getTranslator } from "@/lib/i18n/server";
import { paginate, parsePage, toSearchParams } from "@/lib/pagination";

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
 */
export default async function AdminRequestsPage({
  searchParams,
}: PageProps<"/admin/requests">) {
  await requireStaffPage();
  const { t, locale } = await getI18n();

  const params = toSearchParams(await searchParams);
  const total = await countRequests();
  const page = paginate(total, parsePage(params.get("page")), PER_PAGE);
  const requests = await listRequests(undefined, {
    limit: page.perPage,
    offset: page.offset,
  });
  const waiting = await waitingOnRequests(requests.map(({ id }) => id));

  if (requests.length === 0) {
    return <p className="text-muted-foreground text-sm">{t("common.empty")}</p>;
  }

  return (
    <>
      <ul className="space-y-3">
        {requests.map((request) => (
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
                {nextActions(request.status, request.inLibrary).map(
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
                              placeholder: t("admin.requests.notePlaceholder"),
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
        ))}
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
 * A request being worked on, whose title the server does not hold yet.
 *
 * Said rather than left blank: without the sentence, the missing button reads
 * as something broken instead of as the one move that is not the
 * administration's to make.
 */
function waitingOnLibrary(status: RequestStatus, inLibrary: boolean) {
  return !inLibrary && (status === "accepted" || status === "processing");
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
 * what starts tracking a series, and a row that jumped straight to "being
 * looked for" would skip that and tell the member nothing.
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
  accepted: [
    {
      status: "processing",
      labelKey: "admin.requests.process",
      variant: "secondary",
    },
    {
      status: "available",
      labelKey: "admin.requests.complete",
      variant: "secondary",
    },
  ],
  processing: [
    {
      status: "available",
      labelKey: "admin.requests.complete",
      variant: "secondary",
    },
  ],
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
 *
 * `available` is offered only once the sync has seen the title on the server.
 * Declaring it by hand would close the request and hand the title back to
 * search, where the same ask would be made again, so the button waits for the
 * library rather than for the administrator (`updateRequestStatus` refuses it
 * either way).
 */
function nextActions(
  status: RequestStatus,
  inLibrary: boolean,
): RequestAction[] {
  return OFFERED[status].filter(
    (action) =>
      canMoveRequest(status, action.status) &&
      (action.status !== "available" || inLibrary),
  );
}
