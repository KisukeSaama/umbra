import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { storageDetail, storageHistory } from "@/lib/domain/storage";
import { formatBytes, formatDateTime } from "@/lib/format";
import { requireStaffPage } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";

/**
 * Storage, in full.
 *
 * Volume labels come from configuration, so what is on screen is what the
 * operator chose to name, never a raw device path.
 */
export default async function AdminStoragePage() {
  await requireStaffPage();
  const { t, locale } = await getI18n();
  const [detail, history] = await Promise.all([
    storageDetail(),
    storageHistory(20),
  ]);

  if (!detail)
    return (
      <p className="text-muted-foreground text-sm">{t("storage.unknown")}</p>
    );

  const percent = Math.round(detail.usedRatio * 100);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t("section.storage")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Progress value={percent} aria-label={t("section.storage")} />
          <div className="text-muted-foreground grid gap-1 text-sm tabular-nums sm:grid-cols-3">
            <span>
              {t("admin.storage.total")}:{" "}
              <span className="text-foreground">
                {formatBytes(detail.totalBytes, locale)}
              </span>
            </span>
            <span className="text-foreground">
              {t("storage.used", { percent: `${percent}%` })}
            </span>
            <span>
              {t("admin.storage.free")}:{" "}
              <span className="text-foreground">
                {formatBytes(detail.availableBytes, locale)}
              </span>
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("admin.storage.volumes")}</CardTitle>
        </CardHeader>
        <CardContent>
          {detail.volumes.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("common.empty")}</p>
          ) : (
            <ul className="divide-border/60 -my-2 divide-y">
              {detail.volumes.map((volume) => (
                <li
                  key={volume.label}
                  className="flex items-center justify-between gap-4 py-3"
                >
                  <span className="truncate text-sm font-medium">
                    {volume.label}
                  </span>
                  <span className="text-muted-foreground shrink-0 text-sm tabular-nums">
                    {formatBytes(volume.usedBytes, locale)} /{" "}
                    {formatBytes(volume.totalBytes, locale)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {history.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("admin.storage.history")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-border/60 -my-2 divide-y text-sm">
              {history.map((point) => (
                <li
                  key={point.recordedAt.toISOString()}
                  className="flex items-center justify-between gap-4 py-2"
                >
                  <time
                    dateTime={point.recordedAt.toISOString()}
                    className="text-muted-foreground tabular-nums"
                  >
                    {formatDateTime(point.recordedAt, locale)}
                  </time>
                  <span className="tabular-nums">
                    {formatBytes(point.usedBytes, locale)}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
