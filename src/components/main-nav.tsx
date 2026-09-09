"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useTranslator } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

/**
 * Four destinations, and an admin entry that only administrators see.
 *
 * They are the four moments of the loop: arrive, look for something, follow
 * what you asked for, read what is going on. Polls moved into the news feed,
 * because a poll is news you can answer, and search left the nav entirely: it
 * is a key you press, not a place you go.
 */
const LINKS = [
  { href: "/", key: "nav.home" },
  { href: "/discover", key: "nav.discover" },
  { href: "/activity", key: "nav.activity" },
  { href: "/news", key: "nav.news" },
] as const;

export function MainNav({ isStaff }: { isStaff: boolean }) {
  const t = useTranslator();
  const pathname = usePathname();

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
              "focus-visible:ring-ring/50 relative rounded-full px-3 py-2 text-sm transition-colors outline-none focus-visible:ring-3 sm:px-4 md:py-1.5",
              active
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/60",
            )}
          >
            {t(link.key)}
            {active ? (
              <span className="bg-primary absolute inset-x-3 -bottom-px h-px rounded-full sm:inset-x-4" />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
