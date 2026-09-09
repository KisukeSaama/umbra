import { ActionButton } from "@/components/admin/action-button";
import { Poster } from "@/components/poster";
import { Badge } from "@/components/ui/badge";
import type { RequestStatus } from "@/lib/db/schema";
import { canCarryNote, listRequests } from "@/lib/domain/requests";
import { formatDate } from "@/lib/format";
import type { TranslationKey } from "@/lib/i18n";
import { requireStaffPage } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";

/**
 * Requests, newest first.
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
export default async function AdminRequestsPage() {
  await requireStaffPage();
  const { t, locale } = await getI18n();
  const requests = await listRequests();

  if (requests.length === 0) {
    return <p className="text-muted-foreground text-sm">{t("common.empty")}</p>;
  }

  return (
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
                {t(`admin.requests.status.${request.status}` as TranslationKey)}
              </Badge>
            </div>

            <p className="text-muted-foreground text-xs">
              {formatDate(request.createdAt, locale)}
              {request.requestedBy ? ` · ${request.requestedBy}` : ""}
            </p>

            {request.adminNote ? (
              <p className="border-border/60 text-muted-foreground border-l-2 pl-3 text-sm">
                {request.adminNote}
              </p>
            ) : null}

            <div className="flex flex-wrap gap-2 empty:hidden">
              {nextActions(request.status, request.inLibrary).map((action) => (
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

/**
 * Only the transitions that make sense from the current state.
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
): {
  status: RequestStatus;
  labelKey: TranslationKey;
  variant: "default" | "secondary" | "ghost";
  /** Taking an ask in hand is the one move that may carry a word back. */
  note?: boolean;
}[] {
  switch (status) {
    case "requested":
      return [
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
      ];
    case "accepted":
      return [
        {
          status: "processing",
          labelKey: "admin.requests.process",
          variant: "secondary",
        },
        ...(inLibrary ? [complete] : []),
      ];
    case "processing":
      return inLibrary ? [complete] : [];
    default:
      return [];
  }
}

const complete = {
  status: "available",
  labelKey: "admin.requests.complete",
  variant: "secondary",
} as const;
