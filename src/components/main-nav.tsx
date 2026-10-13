"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useNewsUnread } from "@/components/news-seen";
import { useTranslator } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

/**
 * Four destinations, and an admin entry that only administrators see.
 *
 * They are the four moments of the loop: arrive, look for something, follow
 * what you asked for, read what is going on. Polls moved into the news feed,
 * because a poll is news you can answer, and search left the nav entirely: it
 * is a key you press, not a place you go.
 *
 * This is the pill in the header, from the large breakpoint up. Below it the
 * same destinations are the tab bar at the foot of the screen, in `tab-bar.tsx`,
 * so the header stays one row on a phone.
 */
const LINKS = [
  { href: "/", key: "nav.home" },
  { href: "/discover", key: "nav.discover" },
  { href: "/activity", key: "nav.activity" },
  { href: "/news", key: "nav.news" },
] as const;

export function MainNav({
  isStaff,
  newsUnread = false,
}: {
  isStaff: boolean;
  /** A note went out since this member last opened the feed. */
  newsUnread?: boolean;
}) {
  const t = useTranslator();
  const pathname = usePathname();
  const unread = useNewsUnread(newsUnread);

  const links = isStaff
    ? [...LINKS, { href: "/admin", key: "nav.admin" } as const]
    : LINKS;

  return (
    <nav className="border-border/60 bg-card/60 flex items-center gap-1 rounded-full border p-1 backdrop-blur">
      {links.map((link) => {
        const active =
          link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "focus-visible:ring-ring/50 relative rounded-full px-3 py-1.5 text-sm whitespace-nowrap xl:px-4 transition-colors outline-none focus-visible:ring-3",
              active
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/60",
            )}
          >
            {t(link.key)}
            {link.href === "/news" && unread ? <NewsDot /> : null}
            {active ? (
              <span className="bg-primary absolute inset-x-3 -bottom-px h-px rounded-full xl:inset-x-4" />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Something new on the feed. A state indicator, so it may take the lamp, and a
 * dot alone is a code: the words are there for whoever cannot see it.
 */
export function NewsDot({ className }: { className?: string }) {
  const t = useTranslator();
  return (
    <>
      <span
        aria-hidden
        className={cn(
          "bg-primary ml-1.5 inline-block size-1.5 rounded-full align-middle",
          className,
        )}
      />
      <span className="sr-only">{t("nav.newsUnread")}</span>
    </>
  );
}
