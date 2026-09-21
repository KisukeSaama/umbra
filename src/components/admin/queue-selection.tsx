"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";

import { SpinnerIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { QueueMoveOutcome } from "@/lib/domain/queue-moves";
import { translateError, type TranslationKey } from "@/lib/i18n";
import { useLocale, useTranslator } from "@/lib/i18n/client";
import { bulkMovesFor, type BulkMove, type QueueItemKind } from "@/lib/queue";

/**
 * Several rows of the request queue, worked in one gesture.
 *
 * The rows are server components and stay so: each one carries a single
 * client checkbox, which registers the row here with the moves the server
 * found legal for it. The selection is only ever read against what is still
 * registered, so a row that leaves the page after a refresh leaves the
 * selection with it, and nothing is sent about a row no longer on screen.
 *
 * A selection never spans pages. Page two is other rows, and a move sent to
 * rows the administration cannot see is a decision nobody looked at.
 *
 * It is worked the way a mail client is: a shift-press ticks, or unticks,
 * every row between the last one pressed and this one, and Escape lets go of
 * the whole selection.
 */

type SelectableRow = {
  kind: QueueItemKind;
  id: string;
  title: string;
  moves: readonly BulkMove[];
};

type SelectionState = {
  rows: ReadonlyMap<string, SelectableRow>;
  selected: ReadonlySet<string>;
  register: (row: SelectableRow) => void;
  unregister: (id: string) => void;
  toggle: (id: string, range: boolean) => void;
  setPage: (on: boolean) => void;
  clear: () => void;
  /** Replaces the selection, as a move does with the rows it could not reach. */
  tick: (ids: readonly string[]) => void;
};

const SelectionContext = createContext<SelectionState | null>(null);

function useSelection(): SelectionState {
  const state = useContext(SelectionContext);
  if (!state) throw new Error("A queue checkbox sits outside QueueSelection.");
  return state;
}

const MOVE_LABELS = {
  accept: "admin.requests.accept",
  reject: "admin.requests.reject",
  reopen: "admin.requests.reopen",
} as const satisfies Record<BulkMove, TranslationKey>;

const MOVE_TITLES = {
  accept: "admin.queue.bulk.accept",
  reject: "admin.queue.bulk.reject",
  reopen: "admin.queue.bulk.reopen",
} as const satisfies Record<BulkMove, TranslationKey>;

export function QueueSelection({ children }: { children: ReactNode }) {
  const [rows, setRows] = useState<ReadonlyMap<string, SelectableRow>>(
    () => new Map(),
  );
  const [ticked, setTicked] = useState<ReadonlySet<string>>(() => new Set());

  const register = useCallback((row: SelectableRow) => {
    setRows((current) => new Map(current).set(row.id, row));
  }, []);
  const unregister = useCallback((id: string) => {
    setRows((current) => {
      const next = new Map(current);
      next.delete(id);
      return next;
    });
  }, []);
  // Where the last press landed, which a shift-press extends from.
  const anchor = useRef<string | null>(null);
  const toggle = useCallback((id: string, range: boolean) => {
    const from = anchor.current;
    anchor.current = id;
    setTicked((current) => {
      const next = new Set(current);
      const on = !current.has(id);
      const span = range && from !== null ? between(from, id) : [id];
      for (const one of span) {
        if (on) next.add(one);
        else next.delete(one);
      }
      return next;
    });
  }, []);
  const clear = useCallback(() => {
    anchor.current = null;
    setTicked(new Set());
  }, []);
  const tick = useCallback((ids: readonly string[]) => {
    anchor.current = null;
    setTicked(new Set(ids));
  }, []);

  // What is ticked and still on the page: see the note at the top.
  const selected = useMemo(
    () => new Set([...ticked].filter((id) => rows.has(id))),
    [ticked, rows],
  );
  const setPage = useCallback(
    (on: boolean) => setTicked(on ? new Set(rows.keys()) : new Set()),
    [rows],
  );

  const state = useMemo(
    () => ({
      rows,
      selected,
      register,
      unregister,
      toggle,
      setPage,
      clear,
      tick,
    }),
    [rows, selected, register, unregister, toggle, setPage, clear, tick],
  );

  return (
    <SelectionContext.Provider value={state}>
      {children}
      <BulkBar />
    </SelectionContext.Provider>
  );
}

/**
 * The rows from one box to another, both included, in the order on screen.
 *
 * Read from the page rather than from the registry: the registry is filled in
 * whatever order the rows mounted, and a range is what the eye sees.
 */
function between(from: string, to: string): string[] {
  const order = Array.from(
    document.querySelectorAll<HTMLInputElement>("[data-queue-select]"),
    (input) => input.dataset.queueSelect ?? "",
  );
  const start = order.indexOf(from);
  const end = order.indexOf(to);
  if (start === -1 || end === -1) return [to];
  return order.slice(Math.min(start, end), Math.max(start, end) + 1);
}

/** The box above the list that ticks, or unticks, every row of the page. */
export function QueueSelectPage() {
  const t = useTranslator();
  const { rows, selected, setPage } = useSelection();
  const all = rows.size > 0 && selected.size === rows.size;
  const some = selected.size > 0 && !all;

  return (
    <label className="text-muted-foreground mb-2 flex w-fit cursor-pointer items-center gap-3 px-3 text-xs sm:px-4">
      <input
        type="checkbox"
        className="accent-primary size-4"
        checked={all}
        ref={(input) => {
          if (input) input.indeterminate = some;
        }}
        disabled={rows.size === 0}
        onChange={() => setPage(!all)}
      />
      {t("admin.queue.selectPage")}
    </label>
  );
}

/** One row's box, which is also how the row tells the selection it exists. */
export function QueueSelectBox({ kind, id, title, moves }: SelectableRow) {
  const t = useTranslator();
  const { register, unregister, selected, toggle } = useSelection();
  // The array is rebuilt on every server render; what it holds is what counts.
  const movesKey = moves.join(",");

  useEffect(() => {
    register({
      kind,
      id,
      title,
      moves: movesKey ? (movesKey.split(",") as BulkMove[]) : [],
    });
    return () => unregister(id);
  }, [register, unregister, kind, id, title, movesKey]);

  // A press rather than a change, since only a press says whether shift was
  // held; the keyboard's space bar is a press too. The label around the box
  // widens what can be hit without widening what is drawn.
  return (
    <label className="-m-2 flex cursor-pointer p-2">
      <input
        type="checkbox"
        data-queue-select={id}
        className="accent-primary size-4"
        checked={selected.has(id)}
        readOnly
        // A shift-press would otherwise also select the text it crosses.
        onMouseDown={(event) => {
          if (event.shiftKey) event.preventDefault();
        }}
        onClick={(event) => toggle(id, event.shiftKey)}
        aria-label={t("admin.queue.select", { title })}
      />
    </label>
  );
}

/**
 * The bar that holds the moves, pinned to the bottom while anything is ticked.
 *
 * Every move goes through a dialog that names the rows it will reach, since a
 * selection is easy to widen by one press too many and the members on the
 * other end each get a notification.
 */
function BulkBar() {
  const t = useTranslator();
  const locale = useLocale();
  const router = useRouter();
  const { rows, selected, clear, tick } = useSelection();
  const [pending, setPending] = useState<BulkMove | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const chosen = useMemo(
    () => [...selected].flatMap((id) => rows.get(id) ?? []),
    [rows, selected],
  );
  const offered = bulkMovesFor(chosen);
  const reached = pending
    ? chosen.filter((row) => row.moves.includes(pending))
    : [];

  async function run(move: BulkMove) {
    setBusy(true);
    try {
      const response = await fetch("/api/admin/requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          move,
          adminNote: move === "reopen" ? undefined : note.trim() || null,
          items: reached.map(({ kind, id }) => ({ kind, id })),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(translateError(locale, result.messageKey));

      const { moved, failed } = result as QueueMoveOutcome;
      if (moved > 0)
        toast.success(t("admin.queue.bulk.done", { count: moved }));
      if (failed.length > 0)
        toast.error(
          t("admin.queue.bulk.failed", {
            count: failed.length,
            reason: translateError(locale, failed[0]?.messageKey),
          }),
        );
      setPending(null);
      // What went through leaves the selection; what did not stays ticked,
      // so the rows that need a second look are the ones already in hand.
      tick(failed.map(({ id }) => id));
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

  // Escape lets go of the selection, unless a dialog is open and wants it.
  const holding = chosen.length > 0 && pending === null;
  useEffect(() => {
    if (!holding) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) clear();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [holding, clear]);

  if (chosen.length === 0) return null;

  return (
    <>
      <div className="bg-card/95 ring-foreground/10 sticky bottom-3 z-20 mt-4 flex flex-wrap items-center gap-2 rounded-xl p-2 pl-4 shadow-lg ring-1 backdrop-blur">
        <p className="mr-auto text-sm tabular-nums">
          {t("admin.queue.selected", { count: chosen.length })}
        </p>
        {offered.map(({ move, count }) => (
          <Button
            key={move}
            size="sm"
            variant={move === "accept" ? "default" : "ghost"}
            disabled={busy}
            onClick={() => {
              setNote("");
              setPending(move);
            }}
          >
            {t(MOVE_LABELS[move])}
            {/* Said when the move reaches only part of the selection. */}
            {count < chosen.length ? (
              <span className="tabular-nums opacity-70">{count}</span>
            ) : null}
          </Button>
        ))}
        <Button size="sm" variant="ghost" disabled={busy} onClick={clear}>
          {t("admin.queue.clearSelection")}
        </Button>
      </div>

      <Dialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setPending(null);
        }}
      >
        {pending ? (
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {t(MOVE_TITLES[pending], { count: reached.length })}
              </DialogTitle>
              {reached.length < chosen.length ? (
                <DialogDescription>
                  {t("admin.queue.bulk.onlySome", {
                    count: reached.length,
                    total: chosen.length,
                  })}
                </DialogDescription>
              ) : null}
            </DialogHeader>

            <ul className="bg-secondary/40 max-h-40 space-y-0.5 overflow-y-auto rounded-lg px-3 py-2 text-sm">
              {reached.map((row) => (
                <li key={row.id} className="truncate">
                  {row.title}
                </li>
              ))}
            </ul>

            {pending === "reopen" ? null : (
              <div className="space-y-2">
                <Label htmlFor="bulk-note">{t("admin.requests.note")}</Label>
                <Textarea
                  id="bulk-note"
                  value={note}
                  maxLength={500}
                  rows={3}
                  placeholder={
                    pending === "accept"
                      ? t("admin.requests.notePlaceholder")
                      : t("admin.requests.declineNotePlaceholder")
                  }
                  onChange={(event) => setNote(event.target.value)}
                />
                {pending === "accept" ? (
                  <p className="text-muted-foreground text-xs">
                    {t("admin.queue.bulk.keepNotes")}
                  </p>
                ) : null}
              </div>
            )}

            <DialogFooter>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => setPending(null)}
              >
                {t("common.back")}
              </Button>
              <Button disabled={busy} onClick={() => void run(pending)}>
                {busy ? <SpinnerIcon /> : null}
                {t(MOVE_TITLES[pending], { count: reached.length })}
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  );
}
