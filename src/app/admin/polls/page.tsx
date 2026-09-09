import { ActionButton } from "@/components/admin/action-button";
import { PollForm } from "@/components/admin/poll-form";
import { Badge } from "@/components/ui/badge";
import { listPolls } from "@/lib/domain/polls";
import { formatDate } from "@/lib/format";
import { requireAdminPage } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";

export default async function AdminPollsPage() {
  await requireAdminPage();
  const { t, locale } = await getI18n();
  const polls = await listPolls();

  return (
    <>
      <PollForm />

      {polls.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("poll.none")}</p>
      ) : (
        <ul className="divide-border/60 divide-y">
          {polls.map((poll) => (
            <li
              key={poll.id}
              className="flex flex-wrap items-center gap-3 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{poll.question}</p>
                <p className="text-muted-foreground text-xs tabular-nums">
                  {t("poll.votes", { count: poll.totalVotes })}
                  {" · "}
                  {formatDate(poll.createdAt, locale)}
                </p>
              </div>

              {poll.active ? <Badge>{t("admin.polls.active")}</Badge> : null}

              <ActionButton
                url={`/api/admin/polls/${poll.id}`}
                body={{ active: !poll.active }}
                size="sm"
                variant="secondary"
              >
                {poll.active
                  ? t("admin.polls.deactivate")
                  : t("admin.polls.activate")}
              </ActionButton>

              <ActionButton
                url={`/api/admin/polls/${poll.id}`}
                method="DELETE"
                size="sm"
                variant="ghost"
                confirmMessage={t("common.confirmDelete")}
              >
                {t("common.delete")}
              </ActionButton>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
