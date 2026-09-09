"use client";

import { SpinnerIcon } from "@/components/icons";
import { useRouter } from "next/navigation";
import { useState, type ComponentProps, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { translateError } from "@/lib/i18n";
import { useLocale, useTranslator } from "@/lib/i18n/client";

/**
 * One button for every admin write.
 *
 * The admin screens are server components that read straight from the database;
 * this is the only client piece they need, and a refresh after the call is what
 * keeps the page truthful.
 *
 * A destructive action asks first, in a real dialog rather than the browser's
 * own prompt: the native one cannot be translated, ignores the theme, and
 * cannot be reached the same way on every platform.
 *
 * The same dialog carries `noteField`, the only place in the product where
 * something is typed rather than chosen. It stays optional: sending nothing
 * leaves the request as it is, which is why the confirm button is never
 * disabled on an empty box.
 */
export function ActionButton({
  url,
  method = "PATCH",
  body,
  children,
  successMessage,
  confirmMessage,
  noteField,
  ...buttonProps
}: {
  url: string;
  method?: "POST" | "PATCH" | "DELETE";
  body?: unknown;
  children: ReactNode;
  successMessage?: string;
  confirmMessage?: string;
  /** Asks for an optional line of text and sends it under `name`. */
  noteField?: { name: string; label: string; placeholder?: string };
} & Omit<ComponentProps<typeof Button>, "onClick" | "children">) {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslator();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState("");

  const asking = confirmMessage !== undefined || noteField !== undefined;

  async function run() {
    setBusy(true);
    try {
      const payload =
        noteField === undefined
          ? body
          : { ...(body as object), [noteField.name]: note.trim() || null };
      const response = await fetch(url, {
        method,
        headers:
          payload === undefined
            ? undefined
            : { "Content-Type": "application/json" },
        body: payload === undefined ? undefined : JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(translateError(locale, result.messageKey));

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
      setConfirming(false);
      setNote("");
    }
  }

  return (
    <>
      <Button
        {...buttonProps}
        disabled={busy || buttonProps.disabled}
        onClick={() => (asking ? setConfirming(true) : void run())}
      >
        {busy ? <SpinnerIcon /> : null}
        {children}
      </Button>

      {asking ? (
        <Dialog open={confirming} onOpenChange={setConfirming}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>{children}</DialogTitle>
              {confirmMessage ? (
                <DialogDescription>{confirmMessage}</DialogDescription>
              ) : null}
            </DialogHeader>

            {noteField ? (
              <div className="space-y-2">
                <Label htmlFor={`${noteField.name}-note`}>
                  {noteField.label}
                </Label>
                <Textarea
                  id={`${noteField.name}-note`}
                  value={note}
                  maxLength={500}
                  rows={3}
                  placeholder={noteField.placeholder}
                  onChange={(event) => setNote(event.target.value)}
                />
              </div>
            ) : null}

            <DialogFooter>
              <Button variant="ghost" onClick={() => setConfirming(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                variant={confirmMessage ? "destructive" : "default"}
                disabled={busy}
                onClick={() => void run()}
              >
                {busy ? <SpinnerIcon /> : null}
                {confirmMessage ? t("common.delete") : children}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
