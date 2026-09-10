"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { request, requestError } from "@/components/client-api";
import { CheckIcon, CircleHalfIcon, SpinnerIcon } from "@/components/icons";
import { ReportFlow } from "@/components/report-flow";
import { Button } from "@/components/ui/button";
import type { RequestStatus } from "@/lib/db/schema";
import { isOnServer, type Availability } from "@/lib/domain/availability";
import type { AlternateCut } from "@/lib/domain/cuts";
import { useLocale, useTranslator } from "@/lib/i18n/client";
import type { MediaKind } from "@/lib/providers/metadata";
import { cn } from "@/lib/utils";

/**
 * What a member can do about a title, and never more than the state allows.
 *
 * A title that is not here can be asked for. A title that is here can be
 * reported. A series that is here without being all there is the third case,
 * and it says so here rather than passing for whole.
 *
 * What is missing is asked for one season down, on the line that shows the
 * gap, and nowhere else: an ask for the series as a whole sat here too, saying
 * the same thing in other words, and a member could send both for the very
 * same shortfall.
 *
 * A title somebody else has already asked for is not a dead end: the member
 * can ask for it too, which joins that request rather than opening a second
 * one, and from then on they hear about it like whoever asked first.
 */
export function TitleActions({
  kind,
  providerId,
  title,
  availability,
  followed = null,
  waiting = 0,
  alternateCut = null,
}: {
  kind: MediaKind;
  providerId: string;
  title: string;
  availability: Availability;
  /** The live request this member is waiting on for the title, if any. */
  followed?: { id: string; status: RequestStatus } | null;
  /** How many members wait on the live request for it, 0 when there is none. */
  waiting?: number;
  /** The re-cut the server holds it in, so the report says only what applies. */
  alternateCut?: AlternateCut | null;
}) {
  const t = useTranslator();
  const locale = useLocale();
  const router = useRouter();

  const [state, setState] = useState<Availability>(availability);
  const [sending, setSending] = useState(false);
  /**
   * The request this member is waiting on, as the page read it and as the
   * last call left it. Leaving is offered only while nobody has acted on it,
   * which the domain checks again anyway.
   */
  const [own, setOwn] = useState(followed);
  const [cancelling, setCancelling] = useState(false);

  async function ask() {
    setSending(true);
    try {
      const body = await request<{
        requestId: string;
        status: RequestStatus;
        joined: boolean;
      }>("/api/requests", {
        method: "POST",
        body: { kind, providerId },
      });
      setOwn({ id: body.requestId, status: body.status });
      setState("requested");
      toast.success(
        t(body.joined ? "status.requestJoined" : "status.requestSent"),
      );
      router.refresh();
    } catch (error) {
      toast.error(requestError(locale, error));
    } finally {
      setSending(false);
    }
  }

  async function cancel() {
    if (!own) return;
    setCancelling(true);
    try {
      const body = await request<{ removed: boolean }>(
        `/api/requests/${own.id}`,
        { method: "DELETE" },
      );
      setOwn(null);
      // Others still waiting keep the request alive, and the title with it.
      if (body.removed) setState("absent");
      toast.success(t("status.requestCancelled"));
      router.refresh();
    } catch (error) {
      toast.error(requestError(locale, error));
    } finally {
      setCancelling(false);
    }
  }

  if (isOnServer(state)) {
    const partial = state === "partial";
    return (
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={cn(
            "flex items-center gap-1.5 text-sm",
            partial ? "text-muted-foreground" : "text-primary",
          )}
        >
          {partial ? <CircleHalfIcon /> : <CheckIcon />}
          {t(partial ? "title.onServerPartly" : "title.onServer")}
        </span>
        <ReportFlow
          variant="outline"
          preset={{ kind, providerId, title, alternateCut }}
        />
      </div>
    );
  }

  if (state === "requested" && own)
    return (
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-muted-foreground text-sm">
          {t("title.requestedByYou")}
        </p>
        {own.status === "requested" ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void cancel()}
            disabled={cancelling}
          >
            {cancelling ? <SpinnerIcon /> : null}
            {cancelling ? t("status.cancelling") : t("title.cancelRequest")}
          </Button>
        ) : null}
      </div>
    );

  const button = (
    <Button onClick={() => void ask()} disabled={sending}>
      {sending ? <SpinnerIcon /> : null}
      {sending ? t("status.requesting") : t("title.request")}
    </Button>
  );

  // Asked for by somebody else: the same button, which joins their request,
  // and the one line that makes joining worth it.
  if (state === "requested" && waiting > 0)
    return (
      <div className="flex flex-col items-start gap-2">
        {button}
        <p className="text-muted-foreground text-sm">
          {t("title.waiting", { count: waiting })}
        </p>
      </div>
    );

  return button;
}
