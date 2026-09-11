import { EmptyNote } from "@/components/empty-note";
import { formatPercent } from "@/components/formatting";
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
        <CardTitle>{t("section.storage")}</CardTitle>
        {storage ? (
          <CardAction className="self-center text-sm font-medium tabular-nums">
            {/* The sign is punctuated by the language: French wants a narrow
                no-break space in front of it, English wants none. */}
            {t("storage.used", {
              percent: formatPercent(storage.usedRatio, locale),
            })}
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-2">
        {storage ? (
          <>
            {/* Ochre: the fill is a state indicator, and at four pixels high
                it is a line rather than an area competing with the hero. */}
            <Progress
              value={percent}
              // The value is read aloud as a percentage, punctuated by the
              // language: named here so the server and the browser agree on
              // it, instead of each formatting in its own default locale.
              locale={locale}
              aria-label={t("section.storage")}
              className="[&_[data-slot=progress-indicator]]:bg-primary"
            />
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
