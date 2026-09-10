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
import { ChevronLeftIcon, MenuIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
 * The assistants share this workspace. They can read the accounts section, since
 * knowing who is here is part of helping, but nothing on it that hands out
 * access is drawn for them. Hiding is a courtesy, not the guard: the page and
 * the route check for themselves.
 *
 * The drawer is a real dialog rather than a panel that says it is one. It used
 * to announce `aria-modal` while leaving focus behind on the page underneath,
 * so Tab walked out of the open menu into the content it was covering and
 * closing it left the keyboard nowhere. Moving the focus, trapping it and
 * giving it back is exactly what the dialog primitive already does, and it
 * brings the Escape key and the scroll lock with it.
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

  // From the large breakpoint the sidebar is there at rest and the drawer has
  // nothing left to open, so a window growing past it closes the drawer: a
  // modal dialog left open under a layout that no longer needs it would hold
  // the focus in a menu with no reason left to be there. Only the crossing is
  // watched, never the current width, because the only way in is a button that
  // exists below that breakpoint alone.
  useEffect(() => {
    if (!open) return;
    const wide = window.matchMedia("(min-width: 64rem)");
    const onChange = (event: MediaQueryListEvent) => {
      if (event.matches) setOpen(false);
    };
    wide.addEventListener("change", onChange);
    return () => wide.removeEventListener("change", onChange);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <div className="flex w-full flex-1">
        {/* Resting sidebar, wide screens only. Sticky under the site header,
            with its own scroll so a long list never pushes the page down. */}
        <aside className="border-border/60 sticky top-16 hidden h-[calc(100svh-4rem)] w-60 shrink-0 flex-col overflow-y-auto border-r px-3 py-6 lg:flex">
          <NavList links={links} counts={counts} pathname={pathname} />
          <BackToSite className="mt-auto" />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <SectionBar current={current} counts={counts} />

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

        <Drawer links={links} counts={counts} pathname={pathname} />
      </div>
    </Dialog>
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
}: {
  current: AdminLink;
  counts: AdminCounts;
}) {
  const t = useTranslator();
  const Icon = current.icon;

  return (
    <div className="border-border/60 bg-background/80 sticky top-16 z-30 flex items-center gap-2 border-b px-4 py-2 backdrop-blur sm:px-6 lg:hidden">
      <DialogTrigger render={<Button variant="ghost" size="sm" />}>
        <MenuIcon />
        {t("admin.nav.sections")}
      </DialogTrigger>

      <span className="text-muted-foreground ml-auto flex min-w-0 items-center gap-1.5 text-sm">
        <Icon className="shrink-0" />
        <span className="truncate">{t(current.key)}</span>
      </span>
      <Count link={current} counts={counts} />
    </div>
  );
}

/**
 * The sections, as a sheet down the left edge.
 *
 * The same panel as before, on the dialog primitive: it travels in from the
 * side rather than growing out of the middle, so the geometry and the one
 * motion the panel has are all that is restyled. The heading is the dialog
 * title, which is what names the drawer to a reader who cannot see it, and the
 * close button is the primitive's own.
 */
function Drawer({
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
    <DialogContent className="top-0 bottom-0 left-0 max-h-none w-72 max-w-[85vw] translate-x-0 translate-y-0 rounded-none rounded-r-xl data-open:zoom-in-100 data-open:slide-in-from-left data-closed:zoom-out-100 data-closed:slide-out-to-left">
      <DialogTitle className="text-muted-foreground px-2 pr-10 text-xs font-medium tracking-[0.18em] uppercase">
        {t("admin.title")}
      </DialogTitle>

      <NavList links={links} counts={counts} pathname={pathname} />
      <BackToSite />
    </DialogContent>
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
            {/* Sentence case at the small size: uppercase with tracking is
                spent on the wordmark and on the eyebrow above a page title,
                and a group name in a nav is neither. */}
            <p className="text-muted-foreground px-3 pb-1 text-xs font-medium">
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

/**
 * The way out. A workspace that cannot be left is a trap, not a workspace.
 *
 * It sits at the foot of the sidebar, which is a column tall enough to have a
 * foot. In the drawer it simply follows the sections, since a sheet is as tall
 * as what is in it.
 */
function BackToSite({ className }: { className?: string }) {
  const t = useTranslator();
  return (
    <Link
      href="/"
      className={cn(
        "text-muted-foreground hover:bg-secondary/60 hover:text-foreground focus-visible:ring-ring/50 flex items-center gap-2 rounded-lg px-3 py-2 pt-2 text-sm transition-colors outline-none focus-visible:ring-3",
        className,
      )}
    >
      <ChevronLeftIcon className="shrink-0" />
      {t("admin.backToSite")}
    </Link>
  );
}
