import { ActionButton } from "@/components/admin/action-button";
import {
  CheckCircleIcon,
  ClockIcon,
  ErrorCircleIcon,
  SpinnerIcon,
} from "@/components/icons";
import { Card, CardContent } from "@/components/ui/card";
import { requireStaffPage } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/format";
import type { TranslationKey } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n/server";
import { jobStatus, type JobStatusRow } from "@/lib/jobs";

/**
 * Synchronisation.
 *
 * This page used to list job names and timestamps, which answered a question
 * only the person who wrote them could ask. What an administrator wants to
 * know is plainer: what does this machine do on its own, did it work, and when.
 *
 * So every step is named in words, says what it is for, and reports its last
 * attempt as a sentence. The identifier stays, small and in monospace, because
 * it is what appears in the logs.
 *
 * Nothing here is an uptime indicator: if this page answered, Umbra is up.
 */
export default async function AdminSyncPage() {
  await requireStaffPage();
  const { t, locale } = await getI18n();
  const jobs = await jobStatus();
  const failing = jobs.filter((job) => job.lastStatus === "failure");

  return (
    <>
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-muted-foreground max-w-prose text-sm">
            {t("admin.sync.explain")}
          </p>
          <ActionButton url="/api/admin/jobs/run" method="POST" size="sm">
            {t("admin.jobs.runNow")}
          </ActionButton>
        </CardContent>
      </Card>

      {failing.length > 0 ? (
        <p className="bg-destructive/10 text-destructive rounded-xl px-4 py-3 text-sm">
          {t("admin.sync.failing", { count: failing.length })}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {jobs.map((job) => (
          <JobCard key={job.jobName} job={job} locale={locale} t={t} />
        ))}
      </div>
    </>
  );
}

function JobCard({
  job,
  locale,
  t,
}: {
  job: JobStatusRow;
  locale: "en" | "fr";
  t: (key: TranslationKey, values?: Record<string, string | number>) => string;
}) {
  return (
    <Card className="gap-2">
      <CardContent className="space-y-2">
        <div className="flex items-start gap-2">
          <JobState status={job.lastStatus} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              {t(`admin.job.${job.jobName}` as TranslationKey)}
            </p>
            <p className="text-muted-foreground text-xs">
              {t(`admin.job.${job.jobName}.hint` as TranslationKey)}
            </p>
          </div>
        </div>

        <p className="text-muted-foreground text-sm">
          {job.lastSuccessAt ? (
            <>
              {t("admin.jobs.lastSuccess")}{" "}
              <span className="text-foreground tabular-nums">
                {formatDateTime(job.lastSuccessAt, locale)}
              </span>
            </>
          ) : (
            t("admin.jobs.never")
          )}
        </p>

        {job.lastItems !== null || job.lastDurationMs !== null ? (
          <p className="text-muted-foreground text-xs tabular-nums">
            {[
              job.lastItems !== null
                ? t("admin.jobs.items", { count: job.lastItems })
                : null,
              job.lastDurationMs !== null
                ? t("admin.jobs.took", { value: duration(job.lastDurationMs) })
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        ) : null}

        {job.lastError ? (
          <p className="bg-destructive/10 text-destructive rounded-lg px-2.5 py-2 font-mono text-xs break-words">
            {job.lastError}
          </p>
        ) : null}

        <p className="text-muted-foreground font-mono text-[0.6875rem]">
          {job.jobName}
        </p>
      </CardContent>
    </Card>
  );
}

/** Seconds under a minute, minutes above it. Nobody reads 184000 ms. */
function duration(ms: number) {
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${Math.round(ms / 1000)} s`;
  return `${Math.round(ms / 60_000)} min`;
}

/**
 * How the last attempt went, as a glyph.
 *
 * Written as a component rather than as a function returning one, so the same
 * element type survives a re-render instead of being remounted every time the
 * card is drawn.
 */
function JobState({ status }: { status: string | null }) {
  if (status === "failure")
    return <ErrorCircleIcon className="text-destructive mt-0.5" />;
  if (status === "running")
    return <SpinnerIcon className="text-muted-foreground mt-0.5" />;
  if (status === "success")
    return <CheckCircleIcon className="text-primary mt-0.5" />;
  return <ClockIcon className="text-muted-foreground mt-0.5" />;
}
