"use client";

import { useState } from "react";
import { toast } from "sonner";

import { CheckIcon, SpinnerIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import type { ReportReason } from "@/lib/db/schema";
import { translateError, type TranslationKey } from "@/lib/i18n";
import { useLocale, useTranslator } from "@/lib/i18n/client";
import type { MediaKind } from "@/lib/providers/metadata";

/**
 * Asking for the part that is not here yet.
 *
 * A title on the server is not a title that is finished: a series can be four
 * episodes into a season of ten, and until now the only way to say so was the
 * report flow, three steps away from the very line that shows the shortfall.
 * This is that same report, sent in one press from where the gap is visible,
 * with the reason decided by what the panel already knows rather than by a
 * question. Nothing new reaches the administrator: it is one report queue.
 *
 * Still a choice out of a list, and still nothing to type.
 */
export function UpdateAsk({
  kind,
  providerId,
  seasonNumber = null,
  reason,
  label,
  variant = "outline",
}: {
  kind: MediaKind;
  providerId: string;
  /** Null asks about the series as a whole. */
  seasonNumber?: number | null;
  reason: ReportReason;
  label: TranslationKey;
  variant?: "outline" | "secondary" | "ghost";
}) {
  const t = useTranslator();
  const locale = useLocale();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function send() {
    setSending(true);
    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          providerId,
          seasonNumber,
          episodeNumber: null,
          reason,
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(translateError(locale, body.messageKey));

      setSent(true);
      // Undoing belongs to the moment right after the press, exactly as it does
      // in the report flow: everything later happens on the follow-up page.
      toast.success(t(body.joined ? "update.joined" : "update.sent"), {
        action: {
          label: t("report.withdraw"),
          onClick: () => void withdraw(body.reportId as string),
        },
      });
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

  async function withdraw(reportId: string) {
    try {
      const response = await fetch(`/api/reports/${reportId}`, {
        method: "DELETE",
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(translateError(locale, body.messageKey));

      setSent(false);
      toast.success(t("status.reportWithdrawn"));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : translateError(locale, undefined),
      );
    }
  }

  if (sent)
    return (
      <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <CheckIcon />
        {t("update.asked")}
      </span>
    );

  return (
    <Button
      variant={variant}
      size="sm"
      onClick={() => void send()}
      disabled={sending}
    >
      {sending ? <SpinnerIcon /> : null}
      {t(label)}
    </Button>
  );
}
