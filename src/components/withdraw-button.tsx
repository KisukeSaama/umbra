"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { SpinnerIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { translateError, type TranslationKey } from "@/lib/i18n";
import { useLocale, useTranslator } from "@/lib/i18n/client";

/**
 * Taking back one's own gesture, on the follow-up page.
 *
 * The same button for a request and for a report, because they are the same
 * shape: a member undoes what they asked for as long as nobody has acted on
 * it. Which moves are legal is decided by the domain, so a stale page shows a
 * refusal rather than writing anything.
 */
export function WithdrawButton({
  endpoint,
  label,
  done,
}: {
  endpoint: string;
  label: TranslationKey;
  done: TranslationKey;
}) {
  const t = useTranslator();
  const locale = useLocale();
  const router = useRouter();
  const [sending, setSending] = useState(false);

  async function send() {
    setSending(true);
    try {
      const response = await fetch(endpoint, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok)
        throw new Error(translateError(locale, body.messageKey));

      toast.success(t(done));
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

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => void send()}
      disabled={sending}
    >
      {sending ? <SpinnerIcon /> : null}
      {t(label)}
    </Button>
  );
}
