import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { InProgressRequest } from "@/lib/domain/requests";
import { getI18n } from "@/lib/i18n/server";

/**
 * Requests the staff took up and the server does not hold yet.
 *
 * Shown only when there is something to show: an empty "coming soon" says
 * nothing a member can act on, so the card leaves the page instead of standing
 * there blank. It names titles, never who asked. Every one of them is at the
 * same step, being fetched, so none carries a status of its own.
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
        <CardTitle>{t("section.inProgress")}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-border/60 -my-2 divide-y">
          {requests.map((request) => (
            <li key={request.id}>
              <Link
                href={`/title/${request.media.kind}/${request.media.providerId}`}
                className="block min-w-0 py-3"
              >
                <p className="truncate text-sm font-medium">
                  {request.media.title}
                </p>
                {request.media.year ? (
                  <p className="text-muted-foreground text-xs tabular-nums">
                    {request.media.year}
                  </p>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
