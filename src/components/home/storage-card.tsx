import { EmptyNote } from "@/components/empty-note";
import { GlyphTile } from "@/components/glyph-tile";
import { DiskIcon } from "@/components/icons";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GlyphTile icon={DiskIcon} />
          {t("section.storage")}
        </CardTitle>
        {storage ? (
          <CardAction className="self-center text-sm font-medium tabular-nums">
            {t("storage.used", { percent: `${percent}%` })}
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-2">
        {storage ? (
          <>
            <Progress value={percent} aria-label={t("section.storage")} />
            <p className="text-muted-foreground text-sm tabular-nums">
              {t("storage.available", {
                value: formatBytes(storage.availableBytes, locale),
                total: formatBytes(storage.totalBytes, locale),
              })}
            </p>
          </>
        ) : (
          <EmptyNote icon={DiskIcon}>{t("storage.unknown")}</EmptyNote>
        )}
      </CardContent>
    </Card>
  );
}
