import type { Metadata } from "next";
import type { ComponentType } from "react";

import { AnnouncementReactions } from "@/components/announcement-reactions";
import { EmptyNote } from "@/components/empty-note";
import { GlyphTile } from "@/components/glyph-tile";
import {
  AnnounceIcon,
  DiskIcon,
  ExternalLinkIcon,
  HandHeartIcon,
  InfoIcon,
  MovieIcon,
  SparkleIcon,
  WrenchIcon,
  type IconProps,
} from "@/components/icons";
import { Markdown } from "@/components/markdown";
import { Pagination } from "@/components/pagination";
import { daysUntil } from "@/components/formatting";
import { PollCard } from "@/components/poll-card";
import { Button } from "@/components/ui/button";
import { requireMemberPage } from "@/lib/auth/session";
import type { AnnouncementCategory } from "@/lib/db/schema";
import {
  countPublishedAnnouncements,
  publishedAnnouncements,
} from "@/lib/domain/announcements";
import { formatDate } from "@/lib/format";
import type { TranslationKey } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n/server";
import { paginate, parsePage, toSearchParams } from "@/lib/pagination";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("news.title") };
}

/** Notes per page: about a screenful of a feed nobody scrolls for hours. */
const PER_PAGE = 10;

/**
 * One feed, and one kind of thing in it.
 *
 * A poll used to be a card of its own floating among the announcements. It is
 * now part of the note that asked the question, which is what it always was:
 * something the administration said, that happens to expect an answer back.
 *
 * The feed is chronological, newest first, questions included: a reader opens
 * the page to find out what is new, and a note that asks something is not
 * newer than one that does not.
 *
 * It is set as a column of entries divided by hairlines rather than a stack of
 * identical cards. A card says "one object among many of the same size"; these
 * notes are of wildly different lengths, some carry a question and some three
 * lines, and a wall of boxes flattened all of that into the same rectangle. The
 * left gutter carries what the note is and when it landed, so the eye can skim
 * the column of dates without reading a single body.
 *
 * The feed is cut into pages once it outgrows a screenful. A note stays worth
 * reading long after it landed, so nothing is dropped off the end: the older
 * ones move one step further back, at an address that can be shared.
 */
export default async function NewsPage({ searchParams }: PageProps<"/news">) {
  const account = await requireMemberPage();
  const { t, locale } = await getI18n();

  const params = toSearchParams(await searchParams);
  const total = await countPublishedAnnouncements();
  const page = paginate(total, parsePage(params.get("page")), PER_PAGE);
  const announcements = await publishedAnnouncements(
    page.perPage,
    account.id,
    page.offset,
  );

  return (
    <div className="umbra-container max-w-3xl py-12">
      <header className="mb-10">
        <h1 className="text-3xl tracking-tight sm:text-4xl">
          {t("news.title")}
        </h1>
        <p className="text-muted-foreground mt-1">{t("news.subtitle")}</p>
      </header>

      {announcements.length === 0 ? (
        <EmptyNote icon={AnnounceIcon}>{t("news.none")}</EmptyNote>
      ) : (
        <ol className="border-border/60 border-t">
          {announcements.map((announcement) => (
            /* The id is the anchor a notification points at, so a line in the
               bell lands on the note it is about rather than on the top of the
               feed. */
            <li
              key={announcement.id}
              id={announcement.id}
              className="border-border/60 scroll-mt-[calc(var(--umbra-sticky-top)+0.5rem)] border-b"
            >
              <article className="grid gap-x-8 gap-y-4 py-8 sm:grid-cols-[7.5rem_minmax(0,1fr)]">
                {/* What it is and when, kept out of the reading column so a
                    long note is never introduced by two lines of metadata. */}
                <div className="flex items-center gap-3 sm:block">
                  <GlyphTile
                    icon={CATEGORY_ICONS[announcement.category]}
                    className="size-9"
                  />
                  <div className="min-w-0 sm:mt-3">
                    <p className="text-sm leading-snug font-medium">
                      {t(
                        `news.category.${announcement.category}` as TranslationKey,
                      )}
                    </p>
                    {announcement.publishedAt ? (
                      <time
                        dateTime={announcement.publishedAt.toISOString()}
                        className="text-muted-foreground mt-0.5 block text-xs tabular-nums"
                      >
                        {formatDate(announcement.publishedAt, locale)}
                      </time>
                    ) : null}
                  </div>
                </div>

                <div className="min-w-0 space-y-4">
                  <h2 className="text-lg font-semibold tracking-tight text-balance">
                    {announcement.title}
                  </h2>

                  <Markdown
                    content={announcement.content}
                    className="max-w-prose"
                  />

                  {announcement.link ? (
                    <Button
                      render={
                        <a
                          href={announcement.link.url}
                          target="_blank"
                          rel="noreferrer noopener"
                        />
                      }
                      variant="secondary"
                      size="sm"
                    >
                      {announcement.link.label ?? t("news.openLink")}
                      <ExternalLinkIcon data-icon="inline-end" />
                    </Button>
                  ) : null}

                  {announcement.poll ? (
                    /* A poll is announced on its own, and its notification
                       carries the poll id rather than the note's. */
                    <div
                      id={announcement.poll.id}
                      className="scroll-mt-[calc(var(--umbra-sticky-top)+0.5rem)]"
                    >
                      <PollCard
                        poll={announcement.poll}
                        daysLeft={daysUntil(announcement.poll.endsAt)}
                        bare
                      />
                    </div>
                  ) : null}

                  <AnnouncementReactions
                    announcementId={announcement.id}
                    reactions={announcement.reactions}
                  />
                </div>
              </article>
            </li>
          ))}
        </ol>
      )}

      <Pagination
        page={page}
        pathname="/news"
        params={params}
        label={t("pagination.news")}
      />
    </div>
  );
}

/**
 * A glyph per category, drawn in Quiet Sand like every other glance tile: the
 * lamp on this page belongs to the poll, never to a label.
 */
const CATEGORY_ICONS: Record<AnnouncementCategory, ComponentType<IconProps>> = {
  information: InfoIcon,
  infrastructure: WrenchIcon,
  content: MovieIcon,
  update: SparkleIcon,
  storage: DiskIcon,
  funding: HandHeartIcon,
};
