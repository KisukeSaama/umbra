import type { Metadata } from "next";

import { ActionButton } from "@/components/admin/action-button";
import { AutoRefresh } from "@/components/admin/auto-refresh";
import { formatDuration } from "@/components/admin/duration";
import {
  CheckCircleIcon,
  ClockIcon,
  ErrorCircleIcon,
  SpinnerIcon,
} from "@/components/icons";
import { Card, CardContent } from "@/components/ui/card";
import { requireStaffPage } from "@/lib/auth/session";
import { formatBytes, formatDateTime } from "@/lib/format";
import type { TranslationKey } from "@/lib/i18n";
import { getI18n, getTranslator } from "@/lib/i18n/server";
import { jobStatus, type JobStatusRow } from "@/lib/jobs";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslator();
  return { title: t("meta.admin", { section: t("admin.nav.sync") }) };
}

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
  const working = jobs.some((job) => job.lastStatus === "running");

  return (
    <>
      {/* A cycle takes minutes. Left open, this page follows it rather than
          freezing on the moment it was rendered. */}
      <AutoRefresh active={working} />

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

        {/* A step on its feet says where it is rather than what it did last
            time: the last success is history the moment a new run starts. */}
        {job.lastStatus === "running" ? (
          <p className="text-primary text-sm">
            {t("admin.jobs.status.running")}
            {job.progress ? (
              <span className="text-muted-foreground">
                {" · "}
                {t("admin.jobs.items", { count: job.progress.items })}
                {job.progress.bytes
                  ? ` · ${formatBytes(job.progress.bytes, locale)}`
                  : ""}
                {job.progress.where ? ` · ${job.progress.where}` : ""}
              </span>
            ) : null}
          </p>
        ) : null}

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
                ? t("admin.jobs.took", {
                    value: formatDuration(job.lastDurationMs, t),
                  })
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
