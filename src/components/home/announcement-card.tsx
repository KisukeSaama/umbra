import { AnnounceIcon } from "@/components/icons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AnnouncementView } from "@/lib/domain/announcements";
import type { TranslationKey } from "@/lib/i18n";
import { getTranslator } from "@/lib/i18n/server";

/** The latest announcement, in full. Editorial, never a status page. */
export async function AnnouncementCard({
  announcement,
}: {
  announcement: AnnouncementView | null;
}) {
  const t = await getTranslator();

  return (
    <Card className="h-full">
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle>{t("section.announcement")}</CardTitle>
        {announcement ? (
          <span className="text-muted-foreground text-xs">
            {t(`news.category.${announcement.category}` as TranslationKey)}
          </span>
        ) : null}
      </CardHeader>
      <CardContent>
        {announcement ? (
          <div className="flex gap-3">
            <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
              <AnnounceIcon />
            </span>
            <div className="space-y-1">
              <p className="font-medium">{announcement.title}</p>
              <p className="text-muted-foreground line-clamp-4 text-sm whitespace-pre-line">
                {announcement.content}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">{t("news.none")}</p>
        )}
      </CardContent>
    </Card>
  );
}
