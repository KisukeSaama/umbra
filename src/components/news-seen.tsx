"use client";

import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";

import { request } from "@/components/client-api";

/**
 * The dot on the "news" entry, kept honest in the browser.
 *
 * Whether a note went out since the member last opened the feed is read on
 * the server, with the layout. But a layout is not rendered again when the
 * member moves from one page to the next, so the answer it gave on arrival
 * would bring the dot back the moment they left the feed they had just read.
 * The feed therefore says, here, that it was seen, and both navs read that.
 */
let seenHere = false;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Whether to draw the dot: unread on arrival, and not read since. */
export function useNewsUnread(unreadOnArrival: boolean): boolean {
  const pathname = usePathname();
  const seen = useSyncExternalStore(
    subscribe,
    () => seenHere,
    () => false,
  );
  // On the feed itself the member is reading it: no dot pointing at the page
  // they are on.
  return unreadOnArrival && !seen && !pathname.startsWith("/news");
}

/**
 * Tells Umbra the feed was in front of this member, up to its newest note.
 *
 * Sent from the browser that showed the page, after it showed it: see
 * `/api/news/seen` for why a render does not write. A refusal changes
 * nothing worse than the dot coming back on the next visit, so it is silent.
 */
export function MarkNewsSeen({ through }: { through: string }) {
  useEffect(() => {
    request("/api/news/seen", { body: { through } })
      .then(() => {
        seenHere = true;
        for (const listener of listeners) listener();
      })
      .catch(() => {});
  }, [through]);
  return null;
}
