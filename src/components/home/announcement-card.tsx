import Link from "next/link";

import { AnnouncementReactions } from "@/components/announcement-reactions";
import { EmptyNote } from "@/components/empty-note";
import { GlyphTile } from "@/components/glyph-tile";
import { AnnounceIcon, ExternalLinkIcon } from "@/components/icons";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { AnnouncementView } from "@/lib/domain/announcements";
import { plainText } from "@/lib/markdown";
import type { TranslationKey } from "@/lib/i18n";
import { getTranslator } from "@/lib/i18n/server";

/** The latest announcement, in full. Editorial, never a status page. */
export async function AnnouncementCard({
  announcement,
  className,
}: {
  announcement: AnnouncementView | null;
  className?: string;
}) {
  const t = await getTranslator();

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{t("section.announcement")}</CardTitle>
        {announcement ? (
          <CardAction>
            <Link
              href="/news"
              className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 rounded-md text-xs transition-colors outline-none focus-visible:ring-3"
            >
              {t("common.viewAll")}
            </Link>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent>
        {announcement ? (
          <div className="flex gap-3">
            <GlyphTile icon={AnnounceIcon} className="size-9" />
            <div className="min-w-0 space-y-1">
              <p className="text-muted-foreground text-xs">
                {t(`news.category.${announcement.category}` as TranslationKey)}
              </p>
              <p className="font-medium">{announcement.title}</p>
              {/* A teaser is a sentence that stops, so the marks come off
                  here rather than being clamped mid-block. The line breaks
                  stay: a list read as one sentence runs its items together.
                  The note is read in full on the feed. */}
              <p className="text-muted-foreground line-clamp-4 text-sm whitespace-pre-line">
                {plainText(announcement.content)}
              </p>
              {/* A note whose whole point is an address elsewhere carries it
                  here too, so the home page is not a teaser for one click. */}
              {announcement.link ? (
                <a
                  href={announcement.link.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-primary hover:text-primary/80 focus-visible:ring-ring/50 inline-flex max-w-full items-center gap-1.5 rounded-md pt-1 text-sm transition-colors outline-none focus-visible:ring-3"
                >
                  <span className="truncate">
                    {announcement.link.label ?? t("news.openLink")}
                  </span>
                  <ExternalLinkIcon className="shrink-0" />
                </a>
              ) : null}
              <div className="pt-1">
                <AnnouncementReactions
                  announcementId={announcement.id}
                  reactions={announcement.reactions}
                />
              </div>
            </div>
          </div>
        ) : (
          <EmptyNote icon={AnnounceIcon}>{t("news.none")}</EmptyNote>
        )}
      </CardContent>
    </Card>
  );
}
