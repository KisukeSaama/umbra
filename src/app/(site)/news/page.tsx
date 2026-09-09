import type { Metadata } from "next";

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
import { formatDate } from "@/lib/format";
import type { TranslationKey } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "News" };

export default async function NewsPage() {
  await requireMemberPage();
  const { t, locale } = await getI18n();
  const announcements = await publishedAnnouncements(30);

  return (
    <div className="umbra-container max-w-3xl py-12">
      <h1 className="text-3xl tracking-tight sm:text-4xl">{t("news.title")}</h1>
      <p className="text-muted-foreground mt-1 mb-8">{t("news.subtitle")}</p>

      {announcements.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("news.none")}</p>
      ) : (
        <ul className="space-y-4">
          {announcements.map((announcement) => (
            <li key={announcement.id}>
              <Card>
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
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
