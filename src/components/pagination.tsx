import Link from "next/link";

import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "cn";
import { pageHref, type Page } from "@/lib/pagination";
import { getI18n } from "@/lib/i18n/server";

/**
 * The bar at the foot of a long list.
 *
 * Two steps and a position, nothing else. A row of numbered pages is a control
 * built for jumping to page seven, and nobody jumps to page seven of a feed
 * read newest first: they read on, or they stop. The count is still printed,
 * because a reader who has scrolled a while wants to know whether the end is
 * near.
 *
 * Both steps are real links, so the middle click and the context menu work and
 * a page can be shared. The step that leads nowhere is drawn as text rather
 * than as a dead link: there is nothing there to open in a new tab.
 *
 * The anchor is what makes paging bearable on a page holding two lists: the
 * link lands on the heading of the list that moved rather than at the top of
 * the screen.
 */
export async function Pagination({
  page,
  pathname,
  params,
  paramKey = "page",
  hash,
  label,
  className,
}: {
  page: Page;
  pathname: string;
  params: URLSearchParams;
  paramKey?: string;
  hash?: string;
  /** Names the list this bar belongs to, for a reader who cannot see it. */
  label: string;
  className?: string;
}) {
  const { t } = await getI18n();
  if (page.pageCount <= 1) return null;

  const step = cn(buttonVariants({ variant: "ghost", size: "sm" }));
  const spent = cn(step, "text-muted-foreground/60 pointer-events-none");
  const previous = page.page - 1;
  const next = page.page + 1;

  return (
    <nav
      aria-label={label}
      className={cn("mt-8 flex items-center justify-between gap-4", className)}
    >
      {page.page > 1 ? (
        <Link
          href={pageHref(pathname, params, paramKey, previous, hash)}
          className={step}
          rel="prev"
        >
          <ChevronLeftIcon data-icon="inline-start" />
          {t("pagination.previous")}
        </Link>
      ) : (
        <span className={spent} aria-hidden>
          <ChevronLeftIcon data-icon="inline-start" />
          {t("pagination.previous")}
        </span>
      )}

      <p className="text-muted-foreground text-xs tabular-nums">
        {t("pagination.position", {
          page: page.page,
          pages: page.pageCount,
        })}
      </p>

      {page.page < page.pageCount ? (
        <Link
          href={pageHref(pathname, params, paramKey, next, hash)}
          className={step}
          rel="next"
        >
          {t("pagination.next")}
          <ChevronRightIcon data-icon="inline-end" />
        </Link>
      ) : (
        <span className={spent} aria-hidden>
          {t("pagination.next")}
          <ChevronRightIcon data-icon="inline-end" />
        </span>
      )}
    </nav>
  );
}
