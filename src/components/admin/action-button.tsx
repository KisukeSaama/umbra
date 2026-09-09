"use client";

import { SpinnerIcon } from "@/components/icons";
import { useRouter } from "next/navigation";
import { useState, type ComponentProps, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { translateError } from "@/lib/i18n";
import { useLocale } from "@/lib/i18n/client";

/**
 * One button for every admin write.
 *
 * The admin screens are server components that read straight from the database;
 * this is the only client piece they need, and a refresh after the call is what
 * keeps the page truthful.
 */
export function ActionButton({
  url,
  method = "PATCH",
  body,
  children,
  successMessage,
  confirmMessage,
  ...buttonProps
}: {
  url: string;
  method?: "POST" | "PATCH" | "DELETE";
  body?: unknown;
  children: ReactNode;
  successMessage?: string;
  confirmMessage?: string;
} & Omit<ComponentProps<typeof Button>, "onClick" | "children">) {
  const router = useRouter();
  const locale = useLocale();
  const [busy, setBusy] = useState(false);

  async function run() {
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    setBusy(true);
    try {
      const response = await fetch(url, {
        method,
        headers:
          body === undefined
            ? undefined
            : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(translateError(locale, payload.messageKey));

      if (successMessage) toast.success(successMessage);
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : translateError(locale, undefined),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      {...buttonProps}
      disabled={busy || buttonProps.disabled}
      onClick={() => void run()}
    >
      {busy ? <SpinnerIcon /> : null}
      {children}
    </Button>
  );
}
