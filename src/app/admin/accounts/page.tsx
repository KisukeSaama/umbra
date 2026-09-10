import type { Metadata } from "next";

import { ActionButton } from "@/components/admin/action-button";
import { EmptyNote } from "@/components/empty-note";
import { AccountsIcon } from "@/components/icons";
import { Pagination } from "@/components/pagination";
import { Badge } from "@/components/ui/badge";
import { countAccounts, listAccounts } from "@/lib/domain/accounts";
import { serverMemberCount } from "@/lib/domain/membership";
import { formatDate } from "@/lib/format";
import type { TranslationKey } from "@/lib/i18n";
import { requireStaffPage } from "@/lib/auth/session";
import { getI18n, getTranslator } from "@/lib/i18n/server";
import { paginate, parsePage, toSearchParams } from "@/lib/pagination";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslator();
  return { title: t("meta.admin", { section: t("admin.nav.accounts") }) };
}

/** Accounts per page. One line each, so the page holds more than a queue does. */
const PER_PAGE = 30;

/**
 * Accounts.
 *
 * A Plex identity, a role, and nothing else: no e-mail, no profile, no
 * activity trail, no status. Access is not decided here: it follows the share
 * on plex.tv, checked at sign-in and by the membership sweep
 * (`docs/adr/0014-only-members-of-the-server.md`).
 *
 * An assistant reads this page and changes nothing on it: knowing who is here
 * is part of helping, naming help is not. The buttons are not drawn for them
 * and the route behind those buttons asks for the administrator anyway.
 *
 * What is decided here is help. A member can be named an assistant, which
 * opens the workspace to them, and unnamed again. The
 * administrator is not on that list: there is one, decided by configuration,
 * and their own row carries no action at all.
 *
 * The list is read one page at a time: every row carries up to three buttons,
 * and a community of two hundred was six hundred of them on one screen. The
 * page asks for a count and for that page, so the rest never leaves the
 * database.
 */
export default async function AdminAccountsPage({
  searchParams,
}: PageProps<"/admin/accounts">) {
  // An assistant reads this page; only the administrator acts on it, here and
  // in the route behind the buttons.
  const actor = await requireStaffPage();
  const isAdmin = actor.role === "admin";
  const { t, locale } = await getI18n();

  const params = toSearchParams(await searchParams);
  const total = await countAccounts();
  // How many people have the server, against how many of them ever opened
  // Umbra. Counted by the membership sweep, so this page waits on no gateway.
  const onServer = await serverMemberCount();
  const page = paginate(total, parsePage(params.get("page")), PER_PAGE);
  const accounts = await listAccounts({
    limit: page.perPage,
    offset: page.offset,
  });

  if (total === 0) {
    return <EmptyNote icon={AccountsIcon}>{t("common.empty")}</EmptyNote>;
  }

  return (
    <>
      {onServer !== null ? (
        <p className="text-muted-foreground mb-4 text-sm">
          {t("admin.accounts.reach", { members: onServer, accounts: total })}
        </p>
      ) : null}

      <ul className="divide-border/60 divide-y">
        {accounts.map((account) => (
          <li
            key={account.id}
            className="flex flex-wrap items-center gap-3 py-3"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{account.username}</p>
              <p className="text-muted-foreground text-xs">
                {t(`admin.accounts.role.${account.role}` as TranslationKey)}
                {" · "}
                {formatDate(account.createdAt, locale)}
              </p>
            </div>

            {account.onServer === false ? (
              <Badge variant="destructive">
                {t("admin.accounts.offServer")}
              </Badge>
            ) : null}

            {isAdmin && account.role === "member" ? (
              <ActionButton
                url={`/api/admin/accounts/${account.id}`}
                body={{ role: "assistant" }}
                size="sm"
                variant="secondary"
              >
                {t("admin.accounts.promote")}
              </ActionButton>
            ) : null}

            {isAdmin && account.role === "assistant" ? (
              <ActionButton
                url={`/api/admin/accounts/${account.id}`}
                body={{ role: "member" }}
                size="sm"
                variant="ghost"
              >
                {t("admin.accounts.demote")}
              </ActionButton>
            ) : null}
          </li>
        ))}
      </ul>

      <Pagination
        page={page}
        pathname="/admin/accounts"
        params={params}
        label={t("pagination.accounts")}
      />
    </>
  );
}
