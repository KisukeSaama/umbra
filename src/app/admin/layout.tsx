import { redirect } from "next/navigation";

import { AdminNav } from "@/components/admin/admin-nav";
import { SiteHeader } from "@/components/site-header";
import { currentAccount } from "@/lib/auth/session";
import { getTranslator } from "@/lib/i18n/server";

/**
 * The administration side.
 *
 * Same shell as the public site, one column narrower: this is a workspace, not
 * a dashboard to admire. Access is checked here, not in each page.
 */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const account = await currentAccount();
  if (!account) redirect("/sign-in");
  if (account.role !== "admin" || account.status !== "approved") redirect("/");

  const t = await getTranslator();

  return (
    <>
      <SiteHeader />
      <main className="umbra-container flex-1 py-10">
        <h1 className="mb-6 text-3xl tracking-tight">{t("admin.title")}</h1>
        <div className="grid gap-8 lg:grid-cols-[12rem_1fr]">
          <AdminNav />
          <div className="min-w-0 space-y-8">{children}</div>
        </div>
      </main>
    </>
  );
}
