"use client";

import { useState } from "react";
import { toast } from "sonner";

import { request, requestError } from "@/components/client-api";
import { CheckIcon, SpinnerIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import type { ReportReason } from "@/lib/db/schema";
import type { TranslationKey } from "@/lib/i18n";
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
  asked = false,
  variant = "outline",
}: {
  kind: MediaKind;
  providerId: string;
  /** Null asks about the series as a whole. */
  seasonNumber?: number | null;
  reason: ReportReason;
  label: TranslationKey;
  /**
   * Already open, said by the page rather than by this session. Without it the
   * ask offered itself again on every load: the report was joined instead of
   * duplicated, so nothing was broken, but the member was asked to say a thing
   * that had already been heard.
   */
  asked?: boolean;
  variant?: "outline" | "secondary" | "ghost";
}) {
  const t = useTranslator();
  const locale = useLocale();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(asked);

  async function send() {
    setSending(true);
    try {
      const body = await request<{ reportId: string; joined: boolean }>(
        "/api/reports",
        {
          method: "POST",
          body: {
            kind,
            providerId,
            seasonNumber,
            episodeNumber: null,
            reason,
          },
        },
      );

      setSent(true);
      // Undoing belongs to the moment right after the press, exactly as it does
      // in the report flow: everything later happens on the follow-up page.
      toast.success(t(body.joined ? "update.joined" : "update.sent"), {
        action: {
          label: t("report.withdraw"),
          onClick: () => void withdraw(body.reportId),
        },
      });
    } catch (error) {
      toast.error(requestError(locale, error));
    } finally {
      setSending(false);
    }
  }

  async function withdraw(reportId: string) {
    try {
      await request(`/api/reports/${reportId}`, { method: "DELETE" });
      setSent(false);
      toast.success(t("status.reportWithdrawn"));
    } catch (error) {
      toast.error(requestError(locale, error));
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
