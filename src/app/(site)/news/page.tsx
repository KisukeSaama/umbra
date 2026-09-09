import type { Metadata } from "next";

import { PollCard } from "@/components/poll-card";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireMemberPage } from "@/lib/auth/session";
import { publishedAnnouncements } from "@/lib/domain/announcements";
import { recentPolls } from "@/lib/domain/polls";
import { formatDate } from "@/lib/format";
import type { TranslationKey } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "News" };

/**
 * One feed instead of two pages.
 *
 * A poll is news you can answer, so it belongs beside the announcements rather
 * than behind its own nav entry that held a single card. The open one comes
 * first because it is the only thing here that expects something back; the rest
 * is read and left.
 */
export default async function NewsPage() {
  const account = await requireMemberPage();
  const { t, locale } = await getI18n();

  const [announcements, polls] = await Promise.all([
    publishedAnnouncements(30),
    recentPolls(account.id),
  ]);

  const open = polls.filter(
    (poll) => poll.endsAt === null || poll.endsAt > new Date(),
  );
  const closed = polls.filter((poll) => !open.includes(poll));
  const empty = announcements.length === 0 && polls.length === 0;

  return (
    <div className="umbra-container max-w-3xl py-12">
      <h1 className="text-3xl tracking-tight sm:text-4xl">{t("news.title")}</h1>
      <p className="text-muted-foreground mt-1 mb-8">{t("news.subtitle")}</p>

      {empty ? (
        <p className="text-muted-foreground text-sm">{t("news.none")}</p>
      ) : (
        <div className="space-y-4">
          {open.map((poll) => (
            <PollCard key={poll.id} poll={poll} />
          ))}

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
              <CardContent className="space-y-3">
                <p className="text-muted-foreground max-w-prose text-sm leading-relaxed whitespace-pre-line">
                  {announcement.content}
                </p>
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

          {closed.map((poll) => (
            <PollCard key={poll.id} poll={poll} />
          ))}
        </div>
      )}
    </div>
  );
}
