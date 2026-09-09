"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Keeps a server-rendered page current while something is working.
 *
 * The administration reads straight from the database in server components,
 * which is exactly right for a page you open, read and act on. It is wrong for
 * a page you leave open while a step runs: the figures freeze at the moment the
 * page was rendered, and the only way to see the rest is to reload by hand.
 *
 * So while there is something to watch, the route is re-rendered on a slow
 * beat. No websocket and no state to keep in the browser: the page is already
 * the truth, it just needs asking again.
 */
export function AutoRefresh({
  active,
  everyMs = 5000,
}: {
  active: boolean;
  /** Slow on purpose. This re-renders a whole route on the server. */
  everyMs?: number;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => router.refresh(), everyMs);
    return () => clearInterval(timer);
  }, [active, everyMs, router]);

  return null;
}
