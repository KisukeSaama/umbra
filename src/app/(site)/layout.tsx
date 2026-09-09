import { redirect } from "next/navigation";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { currentAccount } from "@/lib/auth/session";
import { getTranslator } from "@/lib/i18n/server";

/**
 * Umbra is private: everything under this layout needs an approved account.
 *
 * A pending account is not an error, it is a state with its own screen: the
 * administrator has been told, and there is nothing for the visitor to do.
 */
export default async function SiteLayout({ children }: LayoutProps<"/">) {
  const account = await currentAccount();
  if (!account) redirect("/sign-in");

  const t = await getTranslator();

  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        {account.status === "approved" ? (
          children
        ) : (
          <div className="umbra-container flex min-h-[50vh] flex-col items-center justify-center gap-2 text-center">
            <h1 className="text-xl font-semibold">
              {account.status === "blocked"
                ? t("auth.blocked")
                : t("auth.pending")}
            </h1>
            {account.status === "pending" ? (
              <p className="text-muted-foreground max-w-md text-sm">
                {t("auth.pendingHint")}
              </p>
            ) : null}
          </div>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
