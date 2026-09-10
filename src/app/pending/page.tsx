import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { currentAccount } from "@/lib/auth/session";
import { getTranslator } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslator();
  return { title: t("meta.pending") };
}

/**
 * Where an account that is not approved lands.
 *
 * Pending is not an error, it is a state with its own screen: the
 * administrator has been told, and there is nothing for the visitor to do.
 * A blocked account gets the same screen with different words.
 */
export default async function PendingPage() {
  const account = await currentAccount();
  if (!account) redirect("/sign-in");
  if (account.status === "approved") redirect("/");

  const t = await getTranslator();

  return (
    <>
      {/* The member header is a row of doors this visitor cannot open: the nav
          links all lead back here, the palette searches a route the guard
          refuses, and the bell opens a stream it refuses too. What is left is
          the wordmark and the way out. */}
      <SiteHeader minimal />
      <main className="flex-1">
        <div className="umbra-container flex min-h-[50vh] flex-col items-center justify-center gap-3 py-16 text-center">
          <h1 className="text-2xl tracking-tight text-balance sm:text-3xl">
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
      </main>
      <SiteFooter />
    </>
  );
}
