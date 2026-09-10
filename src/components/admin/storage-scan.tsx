"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { formatElapsed } from "@/components/admin/duration";
import { SpinnerIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/format";
import { translateError } from "@/lib/i18n";
import { useLocale, useTranslator } from "@/lib/i18n/client";

/**
 * Measuring the disk, watched rather than waited for.
 *
 * The walk takes minutes, and the first version of this was an ordinary button
 * holding its "busy" flag in its own state. Navigate away and that state is
 * gone with the component: the button comes back pressable while the walk is
 * still running, and pressing it starts a second one.
 *
 * So the truth lives on the server, in the run the step records, and this only
 * reads it. The state arrives with the page, is polled while the walk runs, and
 * the page refreshes itself once when it ends. Coming back to this page an hour
 * later, from another browser, shows exactly the same thing.
 */

export type ScanState = {
  running: boolean;
  startedAt: string | null;
  progress: { items: number; bytes?: number; where?: string } | null;
};

/** Often enough to feel live, rarely enough to be nothing on a database. */
const POLL_MS = 2000;

export function StorageScan({
  initial,
  variant = "default",
}: {
  initial: ScanState;
  variant?: "default" | "secondary";
}) {
  const t = useTranslator();
  const locale = useLocale();
  const router = useRouter();

  const [state, setState] = useState(initial);
  const [starting, setStarting] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // The state that came with the page wins over anything polled before it: a
  // refresh after a walk ends must not be overwritten by an in-flight answer.
  const [shownFor, setShownFor] = useState(initial);
  if (shownFor !== initial) {
    setShownFor(initial);
    setState(initial);
  }

  useEffect(() => {
    if (!state.running) return;
    let cancelled = false;
    // A walk that ends must refresh the page once, and only once: the new tree
    // is a server render away, and two polls can be in flight when it lands.
    let ended = false;

    const tick = async () => {
      try {
        const response = await fetch("/api/admin/storage/scan");
        if (!response.ok || cancelled) return;
        const next = (await response.json()) as ScanState;
        if (cancelled) return;
        setState(next);
        if (!next.running && !ended) {
          ended = true;
          toast.success(t("admin.storage.scanDone"));
          router.refresh();
        }
      } catch {
        // A poll that fails changes nothing: the next one is two seconds away,
        // and the page is still showing the last thing known to be true.
      }
    };

    const poll = setInterval(() => void tick(), POLL_MS);
    // The elapsed time is its own beat, so the seconds keep counting between
    // two answers from the server.
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      cancelled = true;
      clearInterval(poll);
      clearInterval(clock);
    };
  }, [state.running, router, t]);

  async function start() {
    setStarting(true);
    try {
      const response = await fetch("/api/admin/storage/scan", {
        method: "POST",
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(translateError(locale, body.messageKey));

      setState({
        running: true,
        startedAt: new Date().toISOString(),
        progress: null,
      });
      toast.success(t("admin.storage.scanStarted"));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : translateError(locale, undefined),
      );
    } finally {
      setStarting(false);
    }
  }

  if (!state.running)
    return (
      <Button
        variant={variant}
        size="sm"
        disabled={starting}
        onClick={() => void start()}
      >
        {starting ? <SpinnerIcon /> : null}
        {t("admin.storage.measure")}
      </Button>
    );

  const elapsed = state.startedAt
    ? Math.max(0, now - new Date(state.startedAt).getTime())
    : 0;
  const progress = state.progress;

  return (
    <div className="border-border/60 bg-secondary/40 flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2">
      <span className="flex items-center gap-2 text-sm font-medium">
        <SpinnerIcon className="text-primary" />
        {t("admin.storage.scanning")}
      </span>

      {progress ? (
        <span className="text-muted-foreground text-xs tabular-nums">
          {t("admin.storage.scanProgress", { count: progress.items })}
          {progress.bytes ? ` · ${formatBytes(progress.bytes, locale)}` : ""}
          {progress.where
            ? ` · ${t("admin.storage.scanRoot", { label: progress.where })}`
            : ""}
        </span>
      ) : null}

      <span className="text-muted-foreground ml-auto text-xs tabular-nums">
        {t("admin.storage.scanElapsed", { value: formatElapsed(elapsed, t) })}
      </span>
    </div>
  );
}
