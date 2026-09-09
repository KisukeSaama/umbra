"use client";

import { useRouter } from "next/navigation";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTranslator } from "@/lib/i18n/client";

/**
 * The shell that turns the title route into a panel.
 *
 * Closing it goes back rather than changing route, so the shelf you came from
 * is exactly where you left it, scroll position included. Arriving at the same
 * address from a link renders the page instead, and neither case knows about
 * the other.
 */
export function TitleModal({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const t = useTranslator();

  return (
    <Dialog open onOpenChange={(open) => !open && router.back()}>
      <DialogContent className="sm:max-w-3xl">
        {/* The panel repeats the heading for screen readers; the view below
            draws its own. */}
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription className="sr-only">
          {t("discover.title")}
        </DialogDescription>
        {children}
      </DialogContent>
    </Dialog>
  );
}
