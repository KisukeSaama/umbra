"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useTranslator } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

/**
 * Four destinations, and an admin entry that only administrators see.
 * Storage and the funding goal live on the home page rather than in the nav:
 * they are things you glance at, not places you go.
 */
const LINKS = [
  { href: "/", key: "nav.home" },
  { href: "/request", key: "nav.request" },
  { href: "/polls", key: "nav.polls" },
  { href: "/news", key: "nav.news" },
] as const;

export function MainNav({ isAdmin }: { isAdmin: boolean }) {
  const t = useTranslator();
  const pathname = usePathname();

  const links = isAdmin
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
              "relative rounded-full px-3 py-1.5 text-sm transition-colors sm:px-4",
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
