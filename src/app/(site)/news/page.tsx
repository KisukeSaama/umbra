import type { Metadata } from "next";

import { ExternalLinkIcon } from "@/components/icons";
import { PollCard } from "@/components/poll-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireMemberPage } from "@/lib/auth/session";
import { publishedAnnouncements } from "@/lib/domain/announcements";
import { formatDate } from "@/lib/format";
import type { TranslationKey } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "News" };

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
 */
export default async function NewsPage() {
  const account = await requireMemberPage();
  const { t, locale } = await getI18n();

  const announcements = await publishedAnnouncements(30, account.id);

  return (
    <div className="umbra-container max-w-3xl py-12">
      <h1 className="text-3xl tracking-tight sm:text-4xl">{t("news.title")}</h1>
      <p className="text-muted-foreground mt-1 mb-8">{t("news.subtitle")}</p>

      {announcements.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("news.none")}</p>
      ) : (
        <div className="space-y-4">
          {announcements.map((announcement) => (
            <Card key={announcement.id}>
              <CardHeader>
                <CardTitle>{announcement.title}</CardTitle>
                <CardAction>
                  <Badge variant="secondary">
                    {t(
                      `news.category.${announcement.category}` as TranslationKey,
                    )}
                  </Badge>
                </CardAction>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-muted-foreground max-w-prose text-sm leading-relaxed whitespace-pre-line">
                  {announcement.content}
                </p>

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
                  <PollCard poll={announcement.poll} bare />
                ) : null}

                {announcement.publishedAt ? (
                  <p className="text-muted-foreground text-xs">
                    <time dateTime={announcement.publishedAt.toISOString()}>
                      {formatDate(announcement.publishedAt, locale, "long")}
                    </time>
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
