"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import {
  ADMIN_GROUPS,
  ADMIN_LINKS,
  currentLink,
  isCurrent,
  type AdminLink,
} from "@/components/admin/nav-links";
import { ChevronLeftIcon, CloseIcon, MenuIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import type { AdminCounts } from "@/lib/domain/admin";
import { useTranslator } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

/**
 * The workspace shell.
 *
 * The member side is a place to look at things; this is a place to work, so it
 * is built like one: the sections stay on screen with their counts, the heading
 * says where you are, and the content column gets the rest of the width.
 *
 * From the large breakpoint the sidebar is simply there, at rest, scrolling on
 * its own. Below it, it becomes a drawer: a phone has no room for a permanent
 * column, and a row of nine tabs scrolling sideways is a menu you have to hunt
 * through. The section bar above the content names where you are either way.
 *
 * The assistants share this workspace minus what hands out access: the accounts
 * section is not drawn for them. Hiding is a courtesy, not the guard, and the
 * page and the route check for themselves.
 */
export function AdminShell({
  counts,
  isAdmin,
  children,
}: {
  counts: AdminCounts;
  isAdmin: boolean;
  children: ReactNode;
}) {
  const t = useTranslator();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const links = ADMIN_LINKS.filter((link) => isAdmin || !link.adminOnly);
  const current = currentLink(pathname);

  // The drawer closes when the destination changes: on a phone the tap that
  // navigates and the tap that dismisses have to be the same one. Adjusted
  // during the render that brings the new address rather than in an effect
  // afterwards, so the drawer is never painted over the page it just left.
  const [shownFor, setShownFor] = useState(pathname);
  if (shownFor !== pathname) {
    setShownFor(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    // Nothing should scroll behind an open drawer.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <div className="mx-auto flex w-full max-w-[110rem] flex-1">
      {/* Resting sidebar, wide screens only. Sticky under the site header, with
          its own scroll so a long list never pushes the page down. */}
      <aside className="border-border/60 sticky top-16 hidden h-[calc(100svh-4rem)] w-60 shrink-0 flex-col overflow-y-auto border-r px-3 py-6 lg:flex">
        <NavList links={links} counts={counts} pathname={pathname} />
        <BackToSite />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <SectionBar
          current={current}
          counts={counts}
          onOpen={() => setOpen(true)}
        />

        <main className="min-w-0 flex-1 px-4 pt-6 pb-16 sm:px-6 lg:px-8">
          <div className="mb-6 lg:mb-8">
            <p className="text-muted-foreground text-xs font-medium tracking-[0.18em] uppercase">
              {t("admin.title")}
            </p>
            <h1 className="mt-1 text-3xl tracking-tight sm:text-4xl">
              {t(current.key)}
            </h1>
            <p className="text-muted-foreground mt-2 max-w-prose text-sm">
              {t(current.hint)}
            </p>
          </div>

          <div className="space-y-6">{children}</div>
        </main>
      </div>

      {open ? (
        <Drawer
          links={links}
          counts={counts}
          pathname={pathname}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}

/**
 * The bar that names the section on a narrow screen.
 *
 * It carries the only way into the drawer, so it stays sticky: the menu must be
 * reachable from the bottom of a long list without scrolling back up.
 */
function SectionBar({
  current,
  counts,
  onOpen,
}: {
  current: AdminLink;
  counts: AdminCounts;
  onOpen: () => void;
}) {
  const t = useTranslator();
  const Icon = current.icon;

  return (
    <div className="border-border/60 bg-background/80 sticky top-16 z-30 flex items-center gap-2 border-b px-4 py-2 backdrop-blur sm:px-6 lg:hidden">
      <Button variant="ghost" size="sm" onClick={onOpen} aria-haspopup="dialog">
        <MenuIcon />
        {t("admin.nav.sections")}
      </Button>

      <span className="text-muted-foreground ml-auto flex min-w-0 items-center gap-1.5 text-sm">
        <Icon className="shrink-0" />
        <span className="truncate">{t(current.key)}</span>
      </span>
      <Count link={current} counts={counts} />
    </div>
  );
}

function Drawer({
  links,
  counts,
  pathname,
  onClose,
}: {
  links: AdminLink[];
  counts: AdminCounts;
  pathname: string;
  onClose: () => void;
}) {
  const t = useTranslator();

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <button
        type="button"
        aria-label={t("common.close")}
        onClick={onClose}
        className="bg-foreground/20 absolute inset-0 backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("admin.title")}
        className="bg-card ring-foreground/10 absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto px-3 py-4 ring-1 duration-200 motion-safe:animate-in motion-safe:slide-in-from-left"
      >
        <div className="mb-2 flex items-center justify-between px-2">
          <p className="text-muted-foreground text-xs font-medium tracking-[0.18em] uppercase">
            {t("admin.title")}
          </p>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label={t("common.close")}
          >
            <CloseIcon />
          </Button>
        </div>

        <NavList links={links} counts={counts} pathname={pathname} />
        <BackToSite />
      </div>
    </div>
  );
}

function NavList({
  links,
  counts,
  pathname,
}: {
  links: AdminLink[];
  counts: AdminCounts;
  pathname: string;
}) {
  const t = useTranslator();

  return (
    <nav aria-label={t("admin.title")} className="space-y-6">
      {ADMIN_GROUPS.map((group) => {
        const groupLinks = links.filter((link) => link.group === group.group);
        if (groupLinks.length === 0) return null;

        return (
          <div key={group.group}>
            <p className="text-muted-foreground px-3 pb-1 text-[0.6875rem] font-medium tracking-[0.14em] uppercase">
              {t(group.key)}
            </p>
            <ul className="space-y-0.5">
              {groupLinks.map((link) => {
                const active = isCurrent(link.href, pathname);
                const Icon = link.icon;
                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "focus-visible:ring-ring/50 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors outline-none focus-visible:ring-3",
                        active
                          ? "bg-secondary text-foreground font-medium"
                          : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                      )}
                    >
                      <Icon className="shrink-0" />
                      <span className="min-w-0 flex-1 truncate">
                        {t(link.key)}
                      </span>
                      <Count link={link} counts={counts} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

/**
 * The figure at the end of a row.
 *
 * A zero is not drawn: an empty queue should read as nothing there, not as a
 * badge saying nothing there. A failing job is the one count that turns red,
 * because it is the only one that is not simply work waiting.
 */
function Count({ link, counts }: { link: AdminLink; counts: AdminCounts }) {
  if (!link.count) return null;
  const value = counts[link.count];
  if (!value) return null;

  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-1.5 py-0.5 text-xs font-medium tabular-nums",
        link.alarming
          ? "bg-destructive/10 text-destructive"
          : "bg-primary/10 text-primary",
      )}
    >
      {value}
    </span>
  );
}

/** The way out. A workspace that cannot be left is a trap, not a workspace. */
function BackToSite() {
  const t = useTranslator();
  return (
    <Link
      href="/"
      className="text-muted-foreground hover:bg-secondary/60 hover:text-foreground focus-visible:ring-ring/50 mt-auto flex items-center gap-2 rounded-lg px-3 py-2 pt-2 text-sm transition-colors outline-none focus-visible:ring-3"
    >
      <ChevronLeftIcon className="shrink-0" />
      {t("admin.backToSite")}
    </Link>
  );
}
