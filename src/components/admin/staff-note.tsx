"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { NoteIcon, SpinnerIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { translateError } from "@/lib/i18n";
import { useLocale, useTranslator } from "@/lib/i18n/client";

/** How close to the limit the box starts counting, rather than counting always. */
const COUNT_FROM = 40;

/**
 * The staff's note on an account, read and written in its row.
 *
 * Written in place rather than in a dialog: it decides nothing and confirms
 * nothing, and the row it belongs to is the one thing that says whose note it
 * is. A dialog would have had to repeat the name it covers.
 *
 * It renders into the row's flex line: the button sits with the other actions,
 * and the note, or the box that edits it, takes a line of its own under them.
 *
 * The box opens on what is written, keeps what was typed when the write fails,
 * and saves nothing it was not changed: emptying it is how a note is taken back
 * (`docs/adr/0020-staff-remember-who-is-who.md`).
 */
export function StaffNote({
  accountId,
  note,
  maxLength,
}: {
  accountId: string;
  note: string | null;
  maxLength: number;
}) {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslator();
  const id = useId();

  // What the row shows. Set on a successful write, so the new note is there
  // before the refresh brings it back from the server.
  const [shown, setShown] = useState(note);
  const [seen, setSeen] = useState(note);
  if (note !== seen) {
    setSeen(note);
    setShown(note);
  }

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const box = useRef<HTMLTextAreaElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  // Set when the editor closes, so focus goes back where it came from rather
  // than to the top of the page.
  const returnFocus = useRef(false);

  useEffect(() => {
    if (editing) {
      const field = box.current;
      if (!field) return;
      field.focus();
      field.setSelectionRange(field.value.length, field.value.length);
    } else if (returnFocus.current) {
      returnFocus.current = false;
      trigger.current?.focus();
    }
  }, [editing]);

  const next = draft.trim() || null;
  const changed = next !== shown;
  const left = maxLength - draft.length;

  function open() {
    setDraft(shown ?? "");
    setEditing(true);
  }

  function close() {
    returnFocus.current = true;
    setEditing(false);
  }

  async function save(event?: FormEvent) {
    event?.preventDefault();
    if (busy) return;
    if (!changed) return close();

    setBusy(true);
    try {
      const response = await fetch(`/api/admin/accounts/${accountId}/note`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffNote: next }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(translateError(locale, result.messageKey));

      setShown(result.staffNote ?? next);
      close();
      router.refresh();
    } catch (error) {
      // The box stays open on what was typed: a failed write loses nothing.
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
    <>
      {editing ? null : (
        <Button ref={trigger} size="sm" variant="ghost" onClick={open}>
          {t(shown ? "admin.accounts.editNote" : "admin.accounts.addNote")}
        </Button>
      )}

      {editing ? (
        <form
          onSubmit={save}
          className="order-last basis-full space-y-2"
          onKeyDown={(event) => {
            if (event.key === "Escape" && !busy) {
              event.preventDefault();
              close();
            } else if (
              event.key === "Enter" &&
              (event.metaKey || event.ctrlKey)
            ) {
              void save(event);
            }
          }}
        >
          <Label htmlFor={id}>{t("admin.accounts.note")}</Label>
          <Textarea
            ref={box}
            id={id}
            value={draft}
            maxLength={maxLength}
            rows={2}
            disabled={busy}
            placeholder={t("admin.accounts.notePlaceholder")}
            onChange={(event) => setDraft(event.target.value)}
            className="max-w-prose"
          />
          <div className="flex max-w-prose flex-wrap items-center gap-2">
            <Button type="submit" size="sm" disabled={busy || !changed}>
              {busy ? <SpinnerIcon /> : null}
              {t("common.save")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={close}
            >
              {t("common.cancel")}
            </Button>
            {left <= COUNT_FROM ? (
              <span
                aria-live="polite"
                className="text-muted-foreground ml-auto text-xs tabular-nums"
              >
                {t("admin.accounts.noteLeft", { count: left })}
              </span>
            ) : null}
          </div>
        </form>
      ) : shown ? (
        <p className="text-muted-foreground order-last flex basis-full gap-2 text-sm">
          <NoteIcon className="mt-1 shrink-0" aria-hidden />
          <span className="max-w-prose min-w-0 break-words whitespace-pre-line">
            {shown}
          </span>
        </p>
      ) : null}
    </>
  );
}
