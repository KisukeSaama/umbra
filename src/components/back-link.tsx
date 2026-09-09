"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { ChevronLeftIcon } from "@/components/icons";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "cn";
import { useTranslator } from "@/lib/i18n/client";

/**
 * The way out of a page you opened from somewhere else.
 *
 * It goes back through history when there is a history, because that is the
 * only thing that returns the shelf exactly as it was, scroll position
 * included. Opened cold, from a shared link or a new tab, there is nothing
 * behind it, so it becomes an ordinary link to the fallback: an arrow that
 * leads nowhere is worse than no arrow. It stays a real link either way, so the
 * middle click and the context menu still work.
 */
export function BackLink({
  fallback = "/",
  className,
}: {
  fallback?: string;
  className?: string;
}) {
  const router = useRouter();
  const t = useTranslator();

  return (
    <Link
      href={fallback}
      className={cn(
        buttonVariants({ variant: "ghost", size: "sm" }),
        "-ml-2.5",
        className,
      )}
      onClick={(event) => {
        // Let the browser do its own thing when the click asks for a new tab.
        // History is read here rather than on mount: the server has none to
        // look at, and the answer only matters when the link is used.
        if (
          window.history.length <= 1 ||
          event.defaultPrevented ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }
        event.preventDefault();
        router.back();
      }}
    >
      <ChevronLeftIcon />
      {t("common.back")}
    </Link>
  );
}
