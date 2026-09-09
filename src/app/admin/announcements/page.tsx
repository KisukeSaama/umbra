import { ActionButton } from "@/components/admin/action-button";
import { AnnouncementForm } from "@/components/admin/announcement-form";
import { Badge } from "@/components/ui/badge";
import { listAllAnnouncements } from "@/lib/domain/announcements";
import { formatDate } from "@/lib/format";
import type { TranslationKey } from "@/lib/i18n";
import { requireStaffPage } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";

export default async function AdminAnnouncementsPage() {
  await requireStaffPage();
  const { t, locale } = await getI18n();
  const announcements = await listAllAnnouncements();

  return (
    <>
      <AnnouncementForm />

      {announcements.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("news.none")}</p>
      ) : (
        <ul className="divide-border/60 divide-y">
          {announcements.map((announcement) => (
            <li
              key={announcement.id}
              className="flex flex-wrap items-center gap-3 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {announcement.title}
                </p>
                <p className="text-muted-foreground truncate text-xs">
                  {t(
                    `news.category.${announcement.category}` as TranslationKey,
                  )}
                  {" · "}
                  {formatDate(announcement.createdAt, locale)}
                </p>
              </div>

              <Badge variant={announcement.published ? "secondary" : "outline"}>
                {announcement.published
                  ? t("admin.announcements.published")
                  : t("admin.announcements.draft")}
              </Badge>

              {announcement.published ? null : (
                <ActionButton
                  url={`/api/admin/announcements/${announcement.id}`}
                  body={{ published: true }}
                  size="sm"
                >
                  {t("admin.announcements.publish")}
                </ActionButton>
              )}

              <ActionButton
                url={`/api/admin/announcements/${announcement.id}`}
                method="DELETE"
                size="sm"
                variant="ghost"
                confirmMessage={t("common.confirmDelete")}
              >
                {t("common.delete")}
              </ActionButton>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
