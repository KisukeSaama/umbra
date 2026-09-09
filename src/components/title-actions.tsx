"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { CheckIcon, SpinnerIcon } from "@/components/icons";
import { ReportFlow } from "@/components/report-flow";
import { Button } from "@/components/ui/button";
import type { Availability } from "@/lib/domain/catalog";
import { translateError } from "@/lib/i18n";
import { useLocale, useTranslator } from "@/lib/i18n/client";
import type { MediaKind } from "@/lib/providers/metadata";

/**
 * The two things a member can do about a title, and never both at once.
 *
 * A title that is here can be reported. A title that is not can be asked for.
 * Which one shows is decided by the state, so there is never a button that
 * would fail if pressed.
 */
export function TitleActions({
  kind,
  providerId,
  title,
  availability,
}: {
  kind: MediaKind;
  providerId: string;
  title: string;
  availability: Availability;
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

  if (state === "available")
    return (
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-primary flex items-center gap-1.5 text-sm">
          <CheckIcon />
          {t("title.onServer")}
        </span>
        <ReportFlow variant="outline" preset={{ kind, providerId, title }} />
      </div>
    );

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
