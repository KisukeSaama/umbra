import Link from "next/link";

import { AnnouncementReactions } from "@/components/announcement-reactions";
import {
  FundingNotice,
  linkLabel,
  NoteImage,
} from "@/components/announcement-parts";
import { ExternalLinkIcon, PinIcon } from "@/components/icons";
import { buttonVariants } from "@/components/ui/button";
import type { AnnouncementView } from "@/lib/domain/announcements";
import type { TranslationKey } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n/server";
import { plainText } from "@/lib/markdown";
import { cn } from "@/lib/utils";

/**
 * The note the staff pinned to the front of the home page.
 *
 * It sits first under the hero because the notes members missed were the ones
 * that mattered most, the fundraiser above all, and a card in the second row
 * of blocks is read by those who scroll for it. Large, and the only card on
 * the page with a picture of its own: the visual is half of why the staff
 * pinned it, and it takes the wide side of the card from the large breakpoint,
 * the top of it below.
 *
 * A fundraiser is laid out for the one thing it asks: what the money is for,
 * a button to the page where it happens, and the fixed line saying that taking
 * part is voluntary. Nothing else about money appears, here or anywhere.
 */
export async function FeaturedNote({
  announcement,
}: {
  announcement: AnnouncementView;
}) {
  const { t } = await getI18n();
  const funding = announcement.category === "funding";
  const image = announcement.image;

  return (
    <section aria-labelledby="featured-note-title">
      <article
        className={cn(
          "bg-card ring-foreground/10 grid overflow-hidden rounded-2xl ring-1",
          image && "lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]",
        )}
      >
        {image ? (
          <div className="bg-muted lg:relative">
            <NoteImage
              image={image}
              eager
              className="max-h-[22rem] object-cover lg:absolute lg:inset-0 lg:size-full lg:max-h-none"
            />
          </div>
        ) : null}

        <div className="flex min-w-0 flex-col gap-5 p-6 sm:p-8">
          <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-sm">
            <PinIcon aria-hidden />
            <span className="text-foreground font-medium">
              {t("news.featured")}
            </span>
            <span aria-hidden>·</span>
            <span>
              {t(`news.category.${announcement.category}` as TranslationKey)}
            </span>
          </p>

          <Link
            href={`/news#${announcement.id}`}
            className="group focus-visible:ring-ring/50 block space-y-3 rounded-md outline-none focus-visible:ring-3"
          >
            <h2
              id="featured-note-title"
              className="text-2xl leading-tight font-semibold tracking-tight text-balance group-hover:underline sm:text-3xl"
            >
              {announcement.title}
            </h2>
            {/* A teaser stops mid-sentence, so the marks come off first, the
                way the home card does it. */}
            <p className="text-muted-foreground line-clamp-6 text-lg whitespace-pre-line">
              {plainText(announcement.content)}
            </p>
          </Link>

          {funding ? (
            <div className="space-y-3">
              {announcement.link ? (
                <a
                  href={announcement.link.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className={cn(
                    buttonVariants({ size: "lg" }),
                    "max-w-full self-start",
                  )}
                >
                  <span className="truncate">{linkLabel(announcement, t)}</span>
                  <ExternalLinkIcon data-icon="inline-end" />
                </a>
              ) : null}
              <FundingNotice t={t} />
            </div>
          ) : null}

          <div className="border-border/60 mt-auto flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <div className="flex flex-wrap items-center gap-2">
              {!funding && announcement.link ? (
                <a
                  href={announcement.link.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                    "max-w-full",
                  )}
                >
                  <span className="truncate">{linkLabel(announcement, t)}</span>
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
        </div>
      </article>
    </section>
  );
}
