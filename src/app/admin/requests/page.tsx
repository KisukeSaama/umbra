import { ActionButton } from "@/components/admin/action-button";
import { Poster } from "@/components/poster";
import { Badge } from "@/components/ui/badge";
import type { RequestStatus } from "@/lib/db/schema";
import { listRequests } from "@/lib/domain/requests";
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
 * the title lands on the server.
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

            {nextActions(request.status).length > 0 ? (
              <div className="flex flex-wrap gap-2">
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
                          }
                        : undefined
                    }
                  >
                    {t(action.labelKey)}
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

/** Only the transitions that make sense from the current state. */
function nextActions(status: RequestStatus): {
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
        {
          status: "available",
          labelKey: "admin.requests.complete",
          variant: "secondary",
        },
      ];
    case "processing":
      return [
        {
          status: "available",
          labelKey: "admin.requests.complete",
          variant: "secondary",
        },
      ];
    default:
      return [];
  }
}
