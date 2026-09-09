"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { BellIcon } from "@/components/icons";
import { LoadingRegion, TextLine } from "@/components/skeletons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { NotificationKind, NotificationPayload } from "@/lib/db/schema";
import { notificationLine } from "@/lib/i18n/notifications";
import { useTranslator } from "@/lib/i18n/client";

type Item = {
  id: string;
  kind: NotificationKind;
  payload: NotificationPayload;
  read: boolean;
};

/**
 * The reason to come back.
 *
 * The count is rendered by the server with the page, so the header is truthful
 * on arrival, and a stream keeps it that way afterwards: the panel is still
 * fetched when it is opened, which is the only moment the list is worth asking
 * for, while the server-sent events say what changed in between. Nothing polls,
 * in either direction.
 *
 * Nothing here is a stored sentence: every line is a translation key resolved
 * against a little structured payload, so the same notification reads in the
 * language of whoever opens it. The one exception is the word an administrator
 * may attach to a request, which is written rather than resolved and is shown
 * under the line it belongs to.
 */
export function NotificationBell({ unread }: { unread: number }) {
  const t = useTranslator();
  const router = useRouter();
  const [items, setItems] = useState<Item[] | null>(null);
  const [count, setCount] = useState(unread);
  const [loading, setLoading] = useState(false);

  /**
   * The live half.
   *
   * `EventSource` reconnects on its own, and a stream refused outright, a
   * session that expired while the tab stayed open, is not retried at all,
   * which is the behaviour we want: the next navigation lands on the sign-in
   * page rather than a tab knocking every few seconds.
   */
  useEffect(() => {
    const source = new EventSource("/api/notifications/stream");

    source.addEventListener("notifications", (event) => {
      let data: { unread?: number; entries?: Item[] };
      try {
        data = JSON.parse((event as MessageEvent<string>).data);
      } catch {
        return;
      }

      if (typeof data.unread === "number") setCount(data.unread);

      const entries = data.entries ?? [];
      if (entries.length === 0) return;

      // Prepended rather than refetched: the panel may well be open when this
      // lands, and a list that reorders under the cursor is worse than one that
      // grows at the top.
      setItems((current) =>
        current === null
          ? null
          : [
              ...entries,
              ...current.filter(
                (item) => !entries.some((entry) => entry.id === item.id),
              ),
            ],
      );

      for (const entry of entries) {
        toast(notificationLine(t, entry), {
          description: entry.payload.note,
        });
      }

      // The follow-up page, and anything else the server drew from the same
      // rows, catches up in the same breath.
      router.refresh();
    });

    return () => source.close();
  }, [router, t]);

  async function load(open: boolean) {
    if (!open) return;
    setLoading(true);
    try {
      const response = await fetch("/api/notifications");
      const body = await response.json();
      if (response.ok) setItems(body.items as Item[]);
    } finally {
      setLoading(false);
    }
  }

  async function markAllRead() {
    setCount(0);
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    setItems(
      (current) => current?.map((item) => ({ ...item, read: true })) ?? null,
    );
    router.refresh();
  }

  return (
    <DropdownMenu onOpenChange={(open) => void load(open)}>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" />}
        aria-label={t("notifications.open")}
      >
        <span className="relative">
          <BellIcon className="size-5" />
          {count > 0 ? (
            <span
              className="bg-primary absolute -top-0.5 -right-0.5 size-2 rounded-full"
              aria-hidden
            />
          ) : null}
        </span>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between gap-2">
          <span>{t("notifications.title")}</span>
          <span aria-live="polite" className="text-muted-foreground text-xs">
            {count > 0 ? t("notifications.unread", { count }) : null}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {loading && items === null ? (
          <LoadingRegion label={t("common.loading")}>
            {[0, 1, 2].map((index) => (
              <div key={index} className="flex items-start gap-2 px-2 py-2">
                <span className="mt-1.5 size-1.5 shrink-0" aria-hidden />
                <TextLine
                  size="sm"
                  className={index === 1 ? "w-3/4" : "w-full"}
                />
              </div>
            ))}
          </LoadingRegion>
        ) : (items?.length ?? 0) === 0 ? (
          <p className="text-muted-foreground px-2 py-3 text-sm">
            {t("notifications.none")}
          </p>
        ) : (
          <ul className="max-h-80 overflow-y-auto">
            {items?.map((item) => (
              <li
                key={item.id}
                className="flex items-start gap-2 px-2 py-2 text-sm"
              >
                <span
                  className={
                    item.read
                      ? "mt-1.5 size-1.5 shrink-0 rounded-full"
                      : "bg-primary mt-1.5 size-1.5 shrink-0 rounded-full"
                  }
                  aria-hidden
                />
                <span className="leading-snug">
                  {notificationLine(t, item)}
                  {item.payload.note ? (
                    <span className="text-muted-foreground block">
                      {item.payload.note}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void markAllRead()}>
          {t("notifications.markRead")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
