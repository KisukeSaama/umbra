import Link from "next/link";

import { AnnouncementReactions } from "@/components/announcement-reactions";
import { EmptyNote } from "@/components/empty-note";
import { AnnounceIcon, ExternalLinkIcon } from "@/components/icons";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { AnnouncementView } from "@/lib/domain/announcements";
import { formatDate } from "@/lib/format";
import { plainText } from "@/lib/markdown";
import type { TranslationKey } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n/server";
import { cn } from "@/lib/utils";

/**
 * The latest announcement, set as a note from the administration rather than
 * a row in a feed. Editorial, never a status page.
 *
 * The title is the largest line of the card and the body is read at body size,
 * because this is the one place the administration speaks to everyone. What a
 * member can do with it sits on one line at the foot: follow its address, read
 * it in full, react.
 */
export async function AnnouncementCard({
  announcement,
  className,
}: {
  announcement: AnnouncementView | null;
  className?: string;
}) {
  const { t, locale } = await getI18n();

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
          <article className="space-y-4">
            <div className="space-y-2">
              <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-xs">
                <span className="text-foreground font-medium">
                  {t(
                    `news.category.${announcement.category}` as TranslationKey,
                  )}
                </span>
                {announcement.publishedAt ? (
                  <>
                    <span aria-hidden>·</span>
                    <time dateTime={announcement.publishedAt.toISOString()}>
                      {formatDate(announcement.publishedAt, locale, "long")}
                    </time>
                  </>
                ) : null}
              </p>
              {/* The teaser opens the note on the feed, at its anchor. The
                  actions below stay outside it: a control inside a link is
                  two targets under one pointer. */}
              <Link
                href={`/news#${announcement.id}`}
                className="group focus-visible:ring-ring/50 block space-y-2 rounded-md outline-none focus-visible:ring-3"
              >
                <h3 className="text-lg leading-snug font-semibold tracking-tight text-balance group-hover:underline">
                  {announcement.title}
                </h3>
                {/* A teaser is a sentence that stops, so the marks come off
                    here rather than being clamped mid-block. The line breaks
                    stay: a list read as one sentence runs its items together. */}
                <p className="text-muted-foreground line-clamp-5 text-base whitespace-pre-line">
                  {plainText(announcement.content)}
                </p>
              </Link>
            </div>

            <div className="border-border/60 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <div className="flex flex-wrap items-center gap-2">
                {/* A note whose whole point is an address elsewhere carries
                    it here too, so the home page is not a teaser for one
                    click. */}
                {announcement.link ? (
                  <a
                    href={announcement.link.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className={cn(
                      buttonVariants({ variant: "outline", size: "sm" }),
                      "max-w-full",
                    )}
                  >
                    <span className="truncate">
                      {announcement.link.label ?? t("news.openLink")}
                    </span>
                    <ExternalLinkIcon className="shrink-0" />
                  </a>
                ) : null}
                <Link
                  href={`/news#${announcement.id}`}
                  className={buttonVariants({ variant: "ghost", size: "sm" })}
                >
                  {t("news.readMore")}
                </Link>
              </div>
              <AnnouncementReactions
                announcementId={announcement.id}
                reactions={announcement.reactions}
              />
            </div>
          </article>
        ) : (
          <EmptyNote icon={AnnounceIcon}>{t("news.none")}</EmptyNote>
        )}
      </CardContent>
    </Card>
  );
}
