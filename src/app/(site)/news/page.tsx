import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { publishedAnnouncements } from "@/lib/domain/announcements";
import type { TranslationKey } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "News" };

export default async function NewsPage() {
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
                <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
                  <CardTitle className="text-base">
                    {announcement.title}
                  </CardTitle>
                  <Badge variant="secondary">
                    {t(
                      `news.category.${announcement.category}` as TranslationKey,
                    )}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-muted-foreground text-sm whitespace-pre-line">
                    {announcement.content}
                  </p>
                  {announcement.publishedAt ? (
                    <p className="text-muted-foreground text-xs">
                      {announcement.publishedAt.toLocaleDateString(
                        locale === "fr" ? "fr-FR" : "en-US",
                        { day: "numeric", month: "long", year: "numeric" },
                      )}
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
