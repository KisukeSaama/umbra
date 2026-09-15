"use client";

import { ChevronDownIcon, ExternalLinkIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SearchLink } from "@/lib/search-sites";
import { useTranslator } from "@/lib/i18n/client";

/**
 * The way from a queue row out to the search pages.
 *
 * One button for the first site, because that is the one the work usually
 * starts on, and the rest a press away rather than a row of eight buttons on
 * every line. Plain links, so a middle click opens a tab like anywhere else,
 * and always a new tab: the queue being worked is not a page to lose.
 *
 * The addresses are built on the server and handed over ready to open, so the
 * browser is never told what the sites are configured with.
 */
export function SearchSiteButtons({ links }: { links: SearchLink[] }) {
  const t = useTranslator();
  if (links.length === 0) return null;

  const [first, ...others] = links;

  return (
    <div className="flex items-center gap-1">
      <Button
        size="sm"
        variant="outline"
        render={
          <a href={first.url} target="_blank" rel="noopener noreferrer" />
        }
      >
        <ExternalLinkIcon />
        {t("admin.searchSites.searchOn", { name: first.name })}
      </Button>

      {others.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                size="icon-sm"
                variant="outline"
                aria-label={t("admin.searchSites.others")}
              />
            }
          >
            <ChevronDownIcon />
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel>
              {t("admin.searchSites.others")}
            </DropdownMenuLabel>
            {others.map((link) => (
              <DropdownMenuItem
                key={link.id}
                render={
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  />
                }
              >
                <ExternalLinkIcon />
                <span className="truncate">
                  {t("admin.searchSites.searchOn", { name: link.name })}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}
