import { StatStrip } from "@/components/admin/stat-strip";
import { StorageScan } from "@/components/admin/storage-scan";
import { StorageTreemap } from "@/components/admin/storage-treemap";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { requireStaffPage } from "@/lib/auth/session";
import {
  storageDetail,
  storageHistory,
  storageTree,
} from "@/lib/domain/storage";
import { formatBytes, formatDateTime } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { runningJob } from "@/lib/jobs";

/**
 * Storage, in full.
 *
 * Three readings of the same disk, from the coarsest to the finest: how full it
 * is, what is on it, and where the room went since. The map is the reason this
 * page exists; the figures above it are what you check first.
 *
 * Volume labels come from configuration, so what is on screen is what the
 * operator chose to name, never a raw device path.
 */
export default async function AdminStoragePage() {
  await requireStaffPage();
  const { t, locale } = await getI18n();
  const [detail, tree, history, running] = await Promise.all([
    storageDetail(),
    storageTree(),
    storageHistory(12),
    runningJob("storage-scan"),
  ]);

  // The walk outlives the page that started it, so its state comes from the
  // run rather than from whoever pressed the button.
  const scan = {
    running: running !== null,
    startedAt: running?.startedAt.toISOString() ?? null,
    progress: running?.progress ?? null,
  };

  if (!detail)
    return (
      <Card>
        <CardContent className="space-y-4 py-8 text-center">
          <p className="text-muted-foreground text-sm">
            {t("storage.unknown")}
          </p>
          <div className="flex justify-center">
            <StorageScan initial={scan} />
          </div>
        </CardContent>
      </Card>
    );

  const percent = Math.round(detail.usedRatio * 100);

  return (
    <>
      <StatStrip
        stats={[
          {
            label: t("admin.storage.total"),
            value: formatBytes(detail.totalBytes, locale),
          },
          {
            label: t("storage.used", { percent: `${percent}%` }),
            value: formatBytes(detail.usedBytes, locale),
          },
          {
            label: t("admin.storage.free"),
            value: formatBytes(detail.availableBytes, locale),
          },
        ]}
      />

      <Progress value={percent} aria-label={t("section.storage")} />

      <Card>
        <CardHeader>
          <CardTitle>{t("admin.storage.map")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {tree ? (
            <>
              <StorageTreemap roots={tree.roots} />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-muted-foreground text-xs tabular-nums">
                  {t("admin.storage.scannedAt", {
                    date: formatDateTime(tree.scannedAt, locale),
                  })}
                  {" · "}
                  {t("admin.storage.files", { count: tree.fileCount })}
                </p>
                <StorageScan initial={scan} variant="secondary" />
              </div>
            </>
          ) : (
            <div className="space-y-4 py-6 text-center">
              <p className="text-muted-foreground text-sm">
                {t("admin.storage.notScanned")}
              </p>
              <div className="flex justify-center">
                <StorageScan initial={scan} />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2 xl:items-start">
        <Card>
          <CardHeader>
            <CardTitle>{t("admin.storage.volumes")}</CardTitle>
          </CardHeader>
          <CardContent>
            {detail.volumes.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                {t("common.empty")}
              </p>
            ) : (
              <ul className="space-y-3">
                {detail.volumes.map((volume) => {
                  const share =
                    volume.totalBytes > 0
                      ? Math.round((volume.usedBytes / volume.totalBytes) * 100)
                      : 0;
                  return (
                    <li key={volume.label} className="space-y-1.5">
                      <div className="flex items-baseline justify-between gap-4">
                        <span className="min-w-0 truncate text-sm font-medium">
                          {volume.label}
                        </span>
                        <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                          {formatBytes(volume.usedBytes, locale)} /{" "}
                          {formatBytes(volume.totalBytes, locale)}
                        </span>
                      </div>
                      <Progress value={share} aria-label={volume.label} />
                    </li>
                  );
                })}
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
      </div>
    </>
  );
}
