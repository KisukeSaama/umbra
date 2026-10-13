import Image from "next/image";

import { HandHeartIcon } from "@/components/icons";
import type {
  AnnouncementImage,
  AnnouncementView,
} from "@/lib/domain/announcements";
import type { Translator } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * The pieces a note is set from wherever it appears: the feed, the home card
 * and the featured card on the home page.
 */

/**
 * The note's visual.
 *
 * Served by Umbra to signed-in readers, so the image optimiser, which fetches
 * on its own without the reader's session, is skipped: the file is already
 * the size and format Umbra chose when it was uploaded. The width and height
 * come from that file, so the space is held before the picture arrives.
 */
export function NoteImage({
  image,
  className,
  eager = false,
}: {
  image: AnnouncementImage;
  className?: string;
  /** The first thing on the screen, rather than something scrolled to. */
  eager?: boolean;
}) {
  return (
    <Image
      src={image.url}
      alt={image.alt}
      width={image.width}
      height={image.height}
      unoptimized
      loading={eager ? "eager" : "lazy"}
      className={cn("bg-muted h-auto w-full", className)}
    />
  );
}

/** What the button of a note's link says, a fundraiser's being never blank. */
export function linkLabel(announcement: AnnouncementView, t: Translator) {
  if (announcement.link?.label) return announcement.link.label;
  return announcement.category === "funding"
    ? t("news.funding.cta")
    : t("news.openLink");
}

/**
 * The line every fundraiser carries, whatever its note says.
 *
 * Fixed rather than written by the staff, so no wording of the day can make
 * taking part sound like the price of being here: there is no amount, no
 * target and no list of who gave anywhere in Umbra, and this sentence is the
 * one thing it says about the money (see `docs/adr/0010-no-funding-goal.md`).
 */
export function FundingNotice({
  t,
  className,
}: {
  t: Translator;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "text-muted-foreground flex items-start gap-2 text-sm",
        className,
      )}
    >
      <HandHeartIcon className="mt-0.5" aria-hidden />
      <span>{t("news.funding.voluntary")}</span>
    </p>
  );
}
