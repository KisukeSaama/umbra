import { ActionButton } from "@/components/admin/action-button";
import { Badge } from "@/components/ui/badge";
import { listAccounts } from "@/lib/domain/accounts";
import type { TranslationKey } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n/server";

/**
 * Accounts.
 *
 * A Plex identity, a status, and nothing else: no e-mail, no profile, no
 * activity trail. Approving is the only gate into the community.
 */
export default async function AdminAccountsPage() {
  const { t, locale } = await getI18n();
  const accounts = await listAccounts();

  return (
    <ul className="divide-border/60 divide-y">
      {accounts.map((account) => (
        <li key={account.id} className="flex flex-wrap items-center gap-3 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{account.username}</p>
            <p className="text-muted-foreground text-xs">
              {t(`admin.accounts.role.${account.role}` as TranslationKey)} -{" "}
              {account.createdAt.toLocaleDateString(
                locale === "fr" ? "fr-FR" : "en-US",
              )}
            </p>
          </div>

          <Badge
            variant={account.status === "approved" ? "secondary" : "default"}
          >
            {t(`admin.accounts.status.${account.status}` as TranslationKey)}
          </Badge>

          {account.status !== "approved" ? (
            <ActionButton
              url={`/api/admin/accounts/${account.id}`}
              body={{ status: "approved" }}
              size="sm"
            >
              {t("admin.accounts.approve")}
            </ActionButton>
          ) : null}

          {account.status !== "blocked" ? (
            <ActionButton
              url={`/api/admin/accounts/${account.id}`}
              body={{ status: "blocked" }}
              size="sm"
              variant="ghost"
            >
              {t("admin.accounts.block")}
            </ActionButton>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
