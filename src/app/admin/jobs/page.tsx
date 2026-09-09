import { ActionButton } from "@/components/admin/action-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getI18n } from "@/lib/i18n/server";
import { jobStatus } from "@/lib/jobs";

/**
 * Job observability.
 *
 * Enough to answer "is the sync alive, and if not, why": last success, last
 * run, and the error the last failure left behind.
 */
export default async function AdminJobsPage() {
  const { t, locale } = await getI18n();
  const jobs = await jobStatus();
  const format = (date: Date | null) =>
    date
      ? date.toLocaleString(locale === "fr" ? "fr-FR" : "en-US")
      : t("admin.jobs.never");

  return (
    <>
      <ActionButton url="/api/admin/jobs/run" method="POST" size="sm">
        {t("admin.jobs.runNow")}
      </ActionButton>

      <div className="grid gap-4 sm:grid-cols-2">
        {jobs.map((job) => (
          <Card key={job.jobName}>
            <CardHeader>
              <CardTitle className="font-mono text-sm">{job.jobName}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p className="text-muted-foreground">
                {t("admin.jobs.lastSuccess")}: {format(job.lastSuccessAt)}
              </p>
              <p className="text-muted-foreground">
                {t("admin.jobs.lastRun")}: {format(job.lastRunAt)}
                {job.lastStatus ? ` (${job.lastStatus})` : ""}
              </p>
              {job.lastError ? (
                <p className="text-destructive font-mono text-xs break-words">
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
