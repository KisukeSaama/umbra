import { ActionButton } from "@/components/admin/action-button";
import { QueueRow } from "@/components/admin/queue-row";
import { WaitingList } from "@/components/admin/waiting-list";
import { Badge } from "@/components/ui/badge";
import type { RequestStatus } from "@/lib/db/schema";
import {
  canCarryNote,
  canMoveRequest,
  type RequestRow,
} from "@/lib/domain/requests";
import { formatDate } from "@/lib/format";
import type { TranslationKey } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n/server";

/**
 * One request row as the administration works it.
 *
 * A row is one title, however many members want it: a second ask joins the
 * first, and the row names who is waiting: the first of them and how many
 * others, the whole list one press away. Every move and every word on it
 * reaches all of them.
 *
 * Accepting a series is also what starts its tracking, so the buttons here are
 * the entry point of the whole episode pipeline.
 *
 * Accepting may carry an optional word for the person who asked, which reaches
 * them in their notification and on their follow-up page and is erased the day
 * the title lands on the server. That word can be rewritten afterwards, from
 * the same dialog, for as long as it is still displayed: what was being looked
 * for changes, and saying so should not mean moving the request.
 */
export async function RequestItem({
  request,
  waiting,
  showStatus,
}: {
  request: RequestRow;
  /** Who is waiting on it, by name, the first being whoever asked first. */
  waiting: string[];
  /** Left out where the stage shown holds a single status. */
  showStatus: boolean;
}) {
  const { t, locale } = await getI18n();

  return (
    <QueueRow
      poster={{ src: request.media.posterUrl, alt: request.media.title }}
      heading={
        <>
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
          {showStatus ? (
            <Badge variant={statusVariant(request.status)}>
              {t(`admin.requests.status.${request.status}` as TranslationKey)}
            </Badge>
          ) : null}
        </>
      }
      meta={
        <>
          {formatDate(request.createdAt, locale)}
          <WaitingList
            names={waiting}
            title={request.media.title}
            lead=" · "
          />
        </>
      }
      note={request.adminNote}
      footnote={
        waitingOnLibrary(request.status, request.inLibrary)
          ? t("admin.requests.awaitingLibrary")
          : null
      }
      actions={
        <>
          {nextActions(request.status).map((action) => (
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
          ))}

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
        </>
      }
    />
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
