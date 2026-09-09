"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { BellIcon, SpinnerIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { NotificationKind } from "@/lib/db/schema";
import type { TranslationKey } from "@/lib/i18n";
import { useTranslator } from "@/lib/i18n/client";

type Item = {
  id: string;
  kind: NotificationKind;
  payload: {
    title?: string;
    status?: string;
    seasonNumber?: number;
    episodeNumber?: number;
  };
  read: boolean;
};

/**
 * The reason to come back.
 *
 * The count is rendered by the server with the page, so the header is truthful
 * on arrival without anything polling in the background. The list itself is
 * fetched when the panel is opened, which is the only moment it is worth
 * asking for.
 *
 * Nothing here is a stored sentence: every line is a translation key resolved
 * against a little structured payload, so the same notification reads in the
 * language of whoever opens it.
 */
export function NotificationBell({ unread }: { unread: number }) {
  const t = useTranslator();
  const router = useRouter();
  const [items, setItems] = useState<Item[] | null>(null);
  const [count, setCount] = useState(unread);
  const [loading, setLoading] = useState(false);

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
          <div className="text-muted-foreground flex items-center gap-2 px-2 py-3 text-sm">
            <SpinnerIcon />
            {t("common.loading")}
          </div>
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
                <span className="leading-snug">{line(t, item)}</span>
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

/**
 * One line, built from a key and a payload.
 *
 * A status the interface has no wording for falls back to the title alone
 * rather than to a blank row: an entry nobody planned for is still worth
 * seeing.
 */
function line(
  t: (key: TranslationKey, values?: Record<string, string | number>) => string,
  item: Item,
): string {
  const title = item.payload.title ?? "";

  if (item.kind === "request_status" || item.kind === "report_status") {
    const prefix = item.kind === "request_status" ? "request" : "report";
    const key = `notifications.${prefix}.${item.payload.status}`;
    const translated = t(key as TranslationKey, { title });
    return translated === key ? title : translated;
  }
  if (item.kind === "announcement")
    return t("notifications.announcement", { title });
  if (item.kind === "poll_open") return t("notifications.poll", { title });
  return t("notifications.episode", { title });
}
