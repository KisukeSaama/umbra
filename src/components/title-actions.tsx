"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { CheckIcon, SpinnerIcon } from "@/components/icons";
import { ReportFlow } from "@/components/report-flow";
import { Button } from "@/components/ui/button";
import { UpdateAsk } from "@/components/update-ask";
import type { Availability } from "@/lib/domain/catalog";
import { translateError } from "@/lib/i18n";
import { useLocale, useTranslator } from "@/lib/i18n/client";
import type { MediaKind } from "@/lib/providers/metadata";

/**
 * What a member can do about a title, and never more than the state allows.
 *
 * A title that is not here can be asked for. A title that is here can be
 * reported. A series that is here without being all there is the third case,
 * and it used to fall through the first two: the page said "on the server" and
 * offered nothing but a report three steps deep. It now says what it is and
 * carries the ask for the rest next to it.
 */
export function TitleActions({
  kind,
  providerId,
  title,
  availability,
  incomplete = false,
}: {
  kind: MediaKind;
  providerId: string;
  title: string;
  availability: Availability;
  /** A series on the server whose seasons do not add up to what exists. */
  incomplete?: boolean;
}) {
  const t = useTranslator();
  const locale = useLocale();
  const router = useRouter();

  const [state, setState] = useState<Availability>(availability);
  const [sending, setSending] = useState(false);
  /**
   * Set only by the call that has just been made, never read from the page.
   *
   * Undoing is offered to the person who has just pressed the button, because
   * a title that shows as requested on arrival may well have been asked for by
   * somebody else. Everything after that moment happens on the follow-up page,
   * where the request is known to be theirs.
   */
  const [requestId, setRequestId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  async function request() {
    setSending(true);
    try {
      const response = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, providerId }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(translateError(locale, body.messageKey));

      setRequestId(body.requestId as string);
      setState("requested");
      toast.success(t("status.requestSent"));
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : translateError(locale, undefined),
      );
    } finally {
      setSending(false);
    }
  }

  async function cancel() {
    if (!requestId) return;
    setCancelling(true);
    try {
      const response = await fetch(`/api/requests/${requestId}`, {
        method: "DELETE",
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(translateError(locale, body.messageKey));

      setRequestId(null);
      setState("absent");
      toast.success(t("status.requestCancelled"));
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : translateError(locale, undefined),
      );
    } finally {
      setCancelling(false);
    }
  }

  if (state === "available") {
    const partial = kind === "tv" && incomplete;
    return (
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-primary flex items-center gap-1.5 text-sm">
          <CheckIcon />
          {t(partial ? "title.onServerPartly" : "title.onServer")}
        </span>
        {partial ? (
          <UpdateAsk
            kind={kind}
            providerId={providerId}
            reason="series_outdated"
            label="update.askSeries"
          />
        ) : null}
        <ReportFlow
          variant={partial ? "ghost" : "outline"}
          preset={{ kind, providerId, title }}
        />
      </div>
    );
  }

  if (state === "requested")
    return (
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-muted-foreground text-sm">{t("title.requested")}</p>
        {requestId ? (
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

  return (
    <Button onClick={() => void request()} disabled={sending}>
      {sending ? <SpinnerIcon /> : null}
      {sending ? t("status.requesting") : t("title.request")}
    </Button>
  );
}
