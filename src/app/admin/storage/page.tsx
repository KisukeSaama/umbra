import { FileExplorer } from "@/components/admin/file-explorer";
import { StatStrip } from "@/components/admin/stat-strip";
import { StorageScan } from "@/components/admin/storage-scan";
import { StorageTreemap } from "@/components/admin/storage-treemap";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { requireStaffPage } from "@/lib/auth/session";
import { storageDetail, storageTree } from "@/lib/domain/storage";
import { formatBytes, formatDateTime } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { runningJob } from "@/lib/jobs";

/**
 * Storage, in full.
 *
 * Three readings of the same disk, from the coarsest to the finest: how full it
 * is, what is on it, and what exactly is there. The map says where the room
 * went; the explorer under it is where it is taken back, by the administrator
 * alone. The figures above are what you check first.
 *
 * Volume labels come from configuration, so what is on screen is what the
 * operator chose to name, never a raw device path.
 */
export default async function AdminStoragePage() {
  const account = await requireStaffPage();
  const { t, locale } = await getI18n();
  const [detail, tree, running] = await Promise.all([
    storageDetail(),
    storageTree(),
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

      <Card>
        <CardHeader>
          <CardTitle>{t("admin.storage.explorer")}</CardTitle>
          <CardDescription>{t("admin.storage.explorer.hint")}</CardDescription>
        </CardHeader>
        <CardContent>
          {detail.volumes.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("common.empty")}</p>
          ) : (
            <FileExplorer
              volumes={detail.volumes.map((volume) => ({
                label: volume.label,
                usedBytes: volume.usedBytes,
                totalBytes: volume.totalBytes,
              }))}
              canDelete={account.role === "admin"}
            />
          )}
        </CardContent>
      </Card>
    </>
  );
}
