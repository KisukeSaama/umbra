import { ActionButton } from "@/components/admin/action-button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import type { TranslationKey } from "@/lib/i18n";
import { requireStaffPage } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { jobStatus } from "@/lib/jobs";

/**
 * Job observability.
 *
 * Enough to answer "is the sync alive, and if not, why": last success, last
 * run, and the error the last failure left behind.
 */
export default async function AdminJobsPage() {
  await requireStaffPage();
  const { t, locale } = await getI18n();
  const jobs = await jobStatus();
  const format = (date: Date | null) =>
    date ? formatDateTime(date, locale) : t("admin.jobs.never");

  return (
    <>
      <div>
        <ActionButton url="/api/admin/jobs/run" method="POST" size="sm">
          {t("admin.jobs.runNow")}
        </ActionButton>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {jobs.map((job) => (
          <Card key={job.jobName}>
            <CardHeader>
              <CardTitle className="font-mono text-sm font-medium">
                {job.jobName}
              </CardTitle>
              {job.lastStatus ? (
                <CardAction>
                  <Badge
                    variant={
                      job.lastStatus === "failure" ? "destructive" : "secondary"
                    }
                  >
                    {t(`admin.jobs.status.${job.lastStatus}` as TranslationKey)}
                  </Badge>
                </CardAction>
              ) : null}
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p className="text-muted-foreground">
                {t("admin.jobs.lastSuccess")}:{" "}
                <span className="text-foreground tabular-nums">
                  {format(job.lastSuccessAt)}
                </span>
              </p>
              <p className="text-muted-foreground">
                {t("admin.jobs.lastRun")}:{" "}
                <span className="text-foreground tabular-nums">
                  {format(job.lastRunAt)}
                </span>
              </p>
              {job.lastError ? (
                <p className="text-destructive pt-1 font-mono text-xs break-words">
                  {job.lastError}
                </p>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
