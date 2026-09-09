import { DiskIcon } from "@/components/icons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatBytes } from "@/lib/format";
import type { StorageOverview } from "@/lib/domain/storage";
import { getI18n } from "@/lib/i18n/server";

/**
 * Public storage view: a percentage and what is left.
 *
 * No device names, no mount points, no volume layout. Those are in the admin
 * area, where they are useful rather than worrying.
 */
export async function StorageCard({
  storage,
}: {
  storage: StorageOverview | null;
}) {
  const { t, locale } = await getI18n();
  const percent = storage ? Math.round(storage.usedRatio * 100) : 0;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2">
          <span className="bg-primary/10 text-primary flex size-8 items-center justify-center rounded-lg">
            <DiskIcon />
          </span>
          {t("section.storage")}
        </CardTitle>
        {storage ? (
          <span className="text-sm font-medium">
            {t("storage.used", { percent: `${percent}%` })}
          </span>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-2">
        {storage ? (
          <>
            <Progress value={percent} aria-label={t("section.storage")} />
            <p className="text-muted-foreground text-sm">
              {t("storage.available", {
                value: formatBytes(storage.availableBytes, locale),
              })}
            </p>
          </>
        ) : (
          <p className="text-muted-foreground text-sm">
            {t("storage.unknown")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
