import Link from "next/link";

import { Poster } from "@/components/poster";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { InProgressRequest } from "@/lib/domain/requests";
import { getI18n } from "@/lib/i18n/server";

/**
 * Requests the staff took up and the server does not hold yet.
 *
 * Posters rather than a list of names: a member recognises a title by its
 * poster long before they read it, and what is on its way is a promise worth
 * seeing. Every one of them is at the same step, being fetched, so the step is
 * said once under the heading rather than on each poster.
 *
 * Shown only when there is something to show: an empty "coming soon" says
 * nothing a member can act on, so the card leaves the page instead of standing
 * there blank. It names titles, never who asked.
 */
export async function InProgressRequests({
  requests,
  className,
}: {
  requests: InProgressRequest[];
  className?: string;
}) {
  if (requests.length === 0) return null;
  const { t } = await getI18n();

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{t("section.inProgress")}</CardTitle>
        <CardDescription>{t("home.inProgress.hint")}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="grid grid-cols-3 gap-x-3 gap-y-4">
          {requests.map((request) => (
            <li key={request.id} className="min-w-0">
              <Link
                href={`/title/${request.media.kind}/${request.media.providerId}`}
                className="group focus-visible:ring-ring/50 block space-y-1.5 rounded-lg outline-none focus-visible:ring-3"
              >
                <Poster
                  src={request.media.posterUrl}
                  alt={request.media.title}
                  captioned
                  sizes="(min-width: 1024px) 8rem, 30vw"
                />
                <div>
                  <p className="truncate text-sm font-medium group-hover:underline">
                    {request.media.title}
                  </p>
                  {request.media.year ? (
                    <p className="text-muted-foreground text-xs tabular-nums">
                      {request.media.year}
                    </p>
                  ) : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
