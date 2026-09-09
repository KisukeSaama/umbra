"use client";

import { ExternalLinkIcon } from "@/components/icons";
import { buttonVariants } from "@/components/ui/button";
import { episortLink, type EpisortTarget } from "@/lib/episort";
import { useTranslator } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

/**
 * The way from the storage page into Episort.
 *
 * A plain link on the `episort://` scheme: the browser hands it to Episort
 * where it is installed, and nothing happens where it is not, which is why
 * the title says what the link needs. Desktop only, because Episort is a
 * desktop application and a link a phone cannot follow is a broken one.
 */
export function EpisortLink({
  target,
  title,
  className,
}: {
  target: EpisortTarget;
  title: string;
  className?: string;
}) {
  const t = useTranslator();
  return (
    <a
      href={episortLink(target)}
      title={title}
      className={cn(
        buttonVariants({ variant: "outline", size: "sm" }),
        "hidden md:inline-flex",
        className,
      )}
    >
      <ExternalLinkIcon />
      {t("admin.storage.openInEpisort")}
    </a>
  );
}
