import type { Metadata } from "next";
import type { ComponentType, ReactNode } from "react";

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
import type { AnnouncementCategory, EmbedRatio } from "@/lib/db/schema";
import {
  countPublishedAnnouncements,
  publishedAnnouncements,
  type AnnouncementView,
} from "@/lib/domain/announcements";
import { dateParts, formatDate } from "@/lib/format";
import type { TranslationKey, Translator } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n/server";
import { paginate, parsePage, toSearchParams } from "@/lib/pagination";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("news.title") };
}

/** Notes per page: about a screenful of a feed nobody scrolls for hours. */
const PER_PAGE = 10;

/** Where an anchor from the bell lands: clear of the sticky header. */
const ANCHOR = "scroll-mt-[calc(var(--umbra-sticky-top)+0.5rem)]";

type Locale = NonNullable<Parameters<typeof formatDate>[1]>;

type NoteProps = {
  announcement: AnnouncementView;
  t: Translator;
  locale: Locale;
};

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
 * The newest note is the front page. It is the one a member came for, the one
 * the bell and the home page point at, so it is set on a sheet of its own with
 * its title large and its body at reading size, and the date, the way out and
 * the thumbs in a column beside it. Everything older reads as a journal below:
 * the day set large in a gutter the eye can run down without reading a body,
 * the note in a reading column, and what can be pressed in a rail on the
 * right, so every entry offers its actions in the same place whatever its
 * length. Hairlines rather than a stack of identical cards: these notes are of
 * wildly different lengths, and a wall of boxes flattened that into one shape.
 *
 * The feed is cut into pages once it outgrows a screenful. A note stays worth
 * reading long after it landed, so nothing is dropped off the end: the older
 * ones move one step further back, at an address that can be shared. Only the
 * first page has a front page; further back, every note is a journal entry.
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

  const lead = page.page === 1 ? announcements[0] : undefined;
  const feed = lead ? announcements.slice(1) : announcements;

  return (
    <div className="umbra-container py-8 sm:py-12">
      <header className="mb-10 sm:mb-12">
        <p className="text-muted-foreground mb-3 text-xs font-medium tracking-[0.18em] uppercase">
          {t("news.eyebrow")}
        </p>
        <h1 className="text-3xl tracking-tight sm:text-4xl">
          {t("news.title")}
        </h1>
        <p className="text-muted-foreground mt-2 max-w-prose">
          {t("news.subtitle")}
        </p>
      </header>

      {announcements.length === 0 ? (
        <EmptyNote icon={AnnounceIcon}>{t("news.none")}</EmptyNote>
      ) : null}

      {lead ? (
        /* The id is the anchor a notification points at, so a line in the bell
           lands on the note it is about rather than on the top of the feed. */
        <section id={lead.id} className={ANCHOR}>
          <LeadNote announcement={lead} t={t} locale={locale} />
        </section>
      ) : null}

      {feed.length > 0 ? (
        <section
          aria-labelledby={lead ? "news-earlier" : undefined}
          className={lead ? "mt-14 sm:mt-20" : undefined}
        >
          {lead ? (
            <h2
              id="news-earlier"
              className="mb-2 text-lg font-semibold tracking-tight"
            >
              {t("news.earlier")}
            </h2>
          ) : null}
          <ol className="divide-border/60 border-border/60 divide-y border-y">
            {feed.map((announcement) => (
              <li key={announcement.id} id={announcement.id} className={ANCHOR}>
                <FeedNote announcement={announcement} t={t} locale={locale} />
              </li>
            ))}
          </ol>
        </section>
      ) : null}

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
 * The newest note, on a sheet. The body stays in a reading column however wide
 * the screen is; the width left over goes to the column of what surrounds it.
 */
function LeadNote({ announcement, t, locale }: NoteProps) {
  return (
    <article className="bg-card ring-foreground/10 grid overflow-hidden rounded-2xl ring-1 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0 space-y-6 p-6 sm:p-8">
        <Category announcement={announcement} t={t}>
          {announcement.publishedAt ? (
            <span className="text-muted-foreground text-xs tabular-nums lg:hidden">
              {formatDate(announcement.publishedAt, locale, "long")}
            </span>
          ) : null}
        </Category>

        <h2 className="max-w-3xl text-2xl leading-tight font-semibold tracking-tight text-balance sm:text-3xl">
          {announcement.title}
        </h2>

        <Markdown
          content={announcement.content}
          className="max-w-prose text-lg leading-relaxed"
        />

        <NoteEmbed announcement={announcement} t={t} />
        <NotePoll announcement={announcement} />
      </div>

      <aside className="border-border/60 bg-secondary/40 flex flex-col gap-6 border-t p-6 sm:p-8 lg:border-t-0 lg:border-l">
        {announcement.publishedAt ? (
          <DateStub
            date={announcement.publishedAt}
            locale={locale}
            className="hidden lg:block"
            large
          />
        ) : null}
        {/* With no question to answer, the way out is the one thing the note
            asks of its reader, so it takes the lamp. A poll keeps it. */}
        <NoteLink
          announcement={announcement}
          t={t}
          primary={!announcement.poll}
        />
        <div className="lg:mt-auto">
          <AnnouncementReactions
            announcementId={announcement.id}
            reactions={announcement.reactions}
          />
        </div>
      </aside>
    </article>
  );
}

/**
 * An older note, as a journal entry: the day in the gutter, the note in the
 * reading column, and the link and the thumbs in a rail of their own. Below
 * the large breakpoint the rail drops under the note, and on a phone the day
 * joins the category on one line above it.
 */
function FeedNote({ announcement, t, locale }: NoteProps) {
  return (
    <article className="grid gap-x-10 gap-y-5 py-10 sm:grid-cols-[8rem_minmax(0,1fr)] lg:grid-cols-[9rem_minmax(0,1fr)_16rem]">
      <div className="space-y-5">
        {announcement.publishedAt ? (
          <DateStub
            date={announcement.publishedAt}
            locale={locale}
            className="hidden sm:block"
          />
        ) : null}
        <Category announcement={announcement} t={t} compact>
          {announcement.publishedAt ? (
            <span className="text-muted-foreground text-xs tabular-nums sm:hidden">
              {formatDate(announcement.publishedAt, locale, "long")}
            </span>
          ) : null}
        </Category>
      </div>

      <div className="min-w-0 space-y-4">
        <h2 className="text-xl leading-snug font-semibold tracking-tight text-balance">
          {announcement.title}
        </h2>
        <Markdown content={announcement.content} className="max-w-prose" />
        <NoteEmbed announcement={announcement} t={t} />
        <NotePoll announcement={announcement} />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 sm:col-start-2 lg:col-start-3 lg:row-start-1 lg:flex-col lg:items-start">
        <NoteLink announcement={announcement} t={t} />
        <AnnouncementReactions
          announcementId={announcement.id}
          reactions={announcement.reactions}
        />
      </div>
    </article>
  );
}

/** What the note is, beside its glyph, with room for the date on a phone. */
function Category({
  announcement,
  t,
  compact = false,
  children,
}: {
  announcement: AnnouncementView;
  t: Translator;
  compact?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className={cn("flex items-center gap-3", compact && "sm:items-start")}>
      <GlyphTile
        icon={CATEGORY_ICONS[announcement.category]}
        className={cn("size-9", compact && "sm:size-8")}
      />
      <div className="min-w-0">
        <p className="text-sm leading-snug font-medium">
          {t(`news.category.${announcement.category}` as TranslationKey)}
        </p>
        {children}
      </div>
    </div>
  );
}

/**
 * The day set large and the month under it. Light and tabular, so a column of
 * them reads as a calendar rather than as a row of headings; the serif stays
 * on the page title alone.
 */
function DateStub({
  date,
  locale,
  large = false,
  className,
}: {
  date: Date;
  locale: Locale;
  large?: boolean;
  className?: string;
}) {
  const { day, month, year } = dateParts(date, locale);
  return (
    <time dateTime={date.toISOString()} className={cn("block", className)}>
      <span
        className={cn(
          "block leading-none font-light tracking-tight tabular-nums",
          large ? "text-6xl" : "text-4xl",
        )}
      >
        {day}
      </span>
      <span className="text-muted-foreground mt-2 block text-xs">
        {month} {year}
      </span>
    </time>
  );
}

function NoteLink({
  announcement,
  t,
  primary = false,
}: {
  announcement: AnnouncementView;
  t: Translator;
  primary?: boolean;
}) {
  if (!announcement.link) return null;
  return (
    <Button
      render={
        <a
          href={announcement.link.url}
          target="_blank"
          rel="noreferrer noopener"
        />
      }
      variant={primary ? "default" : "secondary"}
      className="max-w-full self-start"
    >
      <span className="truncate">
        {announcement.link.label ?? t("news.openLink")}
      </span>
      <ExternalLinkIcon data-icon="inline-end" />
    </Button>
  );
}

const EMBED_RATIO_CLASSES: Record<EmbedRatio, string> = {
  wide: "aspect-video",
  square: "aspect-square max-w-xl",
  tall: "aspect-[3/4] max-w-xl",
};

/**
 * The page a note sets inside itself (ADR 0018).
 *
 * Sandboxed, so it can run and open a window of its own but never navigate
 * this one, and sent no referrer, so its host does not learn which note it sat
 * in. Loaded lazily: an older note far down the feed costs nothing until it is
 * scrolled to.
 */
function NoteEmbed({
  announcement,
  t,
}: {
  announcement: AnnouncementView;
  t: Translator;
}) {
  if (!announcement.embed) return null;
  return (
    <div
      className={cn(
        "bg-muted ring-foreground/10 w-full max-w-3xl overflow-hidden rounded-xl ring-1",
        EMBED_RATIO_CLASSES[announcement.embed.ratio],
      )}
    >
      <iframe
        src={announcement.embed.url}
        title={announcement.embed.title ?? t("news.embed")}
        className="size-full border-0"
        loading="lazy"
        referrerPolicy="no-referrer"
        sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-presentation"
        allow="fullscreen; picture-in-picture; encrypted-media"
        allowFullScreen
      />
    </div>
  );
}

/** A poll is announced on its own, and its notification carries the poll id
    rather than the note's. */
function NotePoll({ announcement }: { announcement: AnnouncementView }) {
  if (!announcement.poll) return null;
  return (
    <div id={announcement.poll.id} className={cn("max-w-2xl", ANCHOR)}>
      <PollCard
        poll={announcement.poll}
        daysLeft={daysUntil(announcement.poll.endsAt)}
        bare
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
