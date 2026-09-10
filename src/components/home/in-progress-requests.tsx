import Link from "next/link";

import { GlyphTile } from "@/components/glyph-tile";
import { RequestIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { InProgressRequest } from "@/lib/domain/requests";
import { getI18n } from "@/lib/i18n/server";

/**
 * Requests the staff took up and the server does not hold yet.
 *
 * Shown only when there is something to show: an empty "coming soon" says
 * nothing a member can act on, so the card leaves the page instead of standing
 * there blank. It names titles and how far along they are, never who asked.
 */
export async function InProgressRequests({
  requests,
}: {
  requests: InProgressRequest[];
}) {
  if (requests.length === 0) return null;
  const { t } = await getI18n();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GlyphTile icon={RequestIcon} />
          {t("section.inProgress")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-border/60 -my-2 divide-y">
          {requests.map((request) => (
            <li key={request.id}>
              <Link
                href={`/title/${request.media.kind}/${request.media.providerId}`}
                className="flex items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {request.media.title}
                  </p>
                  {request.media.year ? (
                    <p className="text-muted-foreground text-xs tabular-nums">
                      {request.media.year}
                    </p>
                  ) : null}
                </div>
                <Badge
                  variant={
                    request.status === "processing" ? "default" : "secondary"
                  }
                  className="shrink-0"
                >
                  {request.status === "processing"
                    ? t("activity.timeline.processing")
                    : t("activity.timeline.accepted")}
                </Badge>
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
