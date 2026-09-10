"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { request, requestError } from "@/components/client-api";
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
import { useLocale, useTranslator } from "@/lib/i18n/client";
import { notificationHref } from "@/lib/notifications";

type Item = {
  id: string;
  kind: NotificationKind;
  subjectId: string | null;
  payload: NotificationPayload;
  read: boolean;
};

/** Long enough to swallow a burst, short enough to feel immediate. */
const REFRESH_AFTER_MS = 500;

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
 *
 * The count is also said in words next to the bell, in a region that exists
 * whether the panel is open or not: a dot in the corner of an icon is nothing
 * at all to a reader who cannot see it.
 */
export function NotificationBell({ unread }: { unread: number }) {
  const t = useTranslator();
  const locale = useLocale();
  const refresh = useDebouncedRefresh();
  const [items, setItems] = useState<Item[] | null>(null);
  const [count, setCount] = useState(unread);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

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
      // rows, catches up in the same breath. A sync that adds twenty episodes
      // arrives as twenty messages, so the refresh waits for the burst to end
      // rather than re-rendering the route once per line.
      refresh();
    });

    return () => source.close();
  }, [refresh, t]);

  async function load(open: boolean) {
    if (!open) return;
    setLoading(true);
    try {
      const body = await request<{ items: Item[] }>("/api/notifications");
      setItems(body.items);
      setFailed(false);
    } catch (error) {
      // Without this the panel said "no notification", which is a claim about
      // the server rather than about the answer that never came.
      setFailed(true);
      toast.error(requestError(locale, error));
    } finally {
      setLoading(false);
    }
  }

  /**
   * Following a line.
   *
   * The entry is marked read on the way out rather than after the page has
   * loaded: the member has seen it, and the count should not still claim
   * otherwise while the destination renders. `Link` does the navigation, so
   * nothing here waits on the request before leaving. If the write is refused,
   * the line comes back unread: the panel must not disagree with the table.
   */
  function openEntry(item: Item) {
    if (item.read) return;
    const previousCount = count;
    setCount((current) => Math.max(0, current - 1));
    setItems((current) => withRead(current, item.id, true));

    void request("/api/notifications", {
      method: "POST",
      body: { ids: [item.id] },
    })
      .then(() => refresh())
      .catch((error) => {
        setCount(previousCount);
        setItems((current) => withRead(current, item.id, false));
        toast.error(requestError(locale, error));
      });
  }

  async function markAllRead() {
    const previousCount = count;
    const previousItems = items;
    setCount(0);
    setItems(
      (current) => current?.map((item) => ({ ...item, read: true })) ?? null,
    );
    try {
      await request("/api/notifications", { method: "POST", body: {} });
      refresh();
    } catch (error) {
      setCount(previousCount);
      setItems(previousItems);
      toast.error(requestError(locale, error));
    }
  }

  return (
    <>
      <DropdownMenu onOpenChange={(open) => void load(open)}>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon" />}
          aria-label={
            count > 0
              ? t("notifications.openUnread", { count })
              : t("notifications.open")
          }
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

        <DropdownMenuContent
          align="end"
          className="w-[min(22rem,calc(100vw-1rem))] p-1.5"
        >
          <DropdownMenuLabel className="flex items-center justify-between gap-2 px-2 py-1.5">
            <span>{t("notifications.title")}</span>
            <span className="text-muted-foreground text-xs">
              {count > 0 ? t("notifications.unread", { count }) : null}
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />

          {loading && items === null ? (
            <LoadingRegion label={t("common.loading")}>
              {[0, 1, 2].map((index) => (
                <div key={index} className="flex items-start gap-2.5 px-2 py-3">
                  <span className="mt-2 size-1.5 shrink-0" aria-hidden />
                  <TextLine
                    size="sm"
                    className={index === 1 ? "w-3/4" : "w-full"}
                  />
                </div>
              ))}
            </LoadingRegion>
          ) : failed && items === null ? (
            <p className="text-muted-foreground px-2 py-4 text-sm">
              {t("notifications.failed")}
            </p>
          ) : (items?.length ?? 0) === 0 ? (
            <p className="text-muted-foreground px-2 py-4 text-sm">
              {t("notifications.none")}
            </p>
          ) : (
            <div className="divide-foreground/5 max-h-96 divide-y overflow-y-auto">
              {items?.map((item) => {
                const href = notificationHref(item);
                const body = (
                  <>
                    <span
                      className={
                        item.read
                          ? "mt-2 size-1.5 shrink-0 rounded-full"
                          : "bg-primary mt-2 size-1.5 shrink-0 rounded-full"
                      }
                      aria-hidden
                    />
                    <span className="leading-relaxed">
                      {notificationLine(t, item)}
                      {item.payload.note ? (
                        <span className="text-muted-foreground mt-1 block">
                          {item.payload.note}
                        </span>
                      ) : null}
                    </span>
                  </>
                );

                // An entry with somewhere to go is a menu item rendered as a
                // link: keyboard traversal, middle click and open in a new tab
                // all come for free. One with nowhere to go stays a plain line
                // rather than pretending to be reachable.
                return href ? (
                  <DropdownMenuItem
                    key={item.id}
                    render={<Link href={href} />}
                    className="items-start gap-2.5 px-2 py-3 text-sm"
                    onClick={() => openEntry(item)}
                  >
                    {body}
                  </DropdownMenuItem>
                ) : (
                  <div
                    key={item.id}
                    className="flex items-start gap-2.5 px-2 py-3 text-sm"
                  >
                    {body}
                  </div>
                );
              })}
            </div>
          )}

          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="px-2 py-2"
            onClick={() => void markAllRead()}
          >
            {t("notifications.markRead")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Beside the bell rather than inside the panel: the panel is unmounted
          while it is closed, which is exactly when the count changes. */}
      <span className="sr-only" role="status" aria-live="polite">
        {count > 0 ? t("notifications.unread", { count }) : ""}
      </span>
    </>
  );
}

/** One entry's read flag, without touching the rest of the list. */
function withRead(items: Item[] | null, id: string, read: boolean) {
  return (
    items?.map((item) => (item.id === id ? { ...item, read } : item)) ?? null
  );
}

/**
 * One route refresh for a run of changes.
 *
 * A library sync that adds twenty episodes sends twenty messages down the
 * stream, and each one used to re-render the whole route in every open tab.
 * The last one within half a second is the only one that has to.
 */
function useDebouncedRefresh(): () => void {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      router.refresh();
    }, REFRESH_AFTER_MS);
  }, [router]);
}
