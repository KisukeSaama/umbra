import { redirect } from "next/navigation";

import { AdminHeading, AdminNav } from "@/components/admin/admin-nav";
import { SiteHeader } from "@/components/site-header";
import { currentAccount } from "@/lib/auth/session";

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

  return (
    <>
      <SiteHeader />
      <main className="umbra-container flex-1 py-12">
        <AdminHeading />
        <div className="grid gap-8 lg:grid-cols-[12rem_1fr]">
          <AdminNav />
          <div className="min-w-0 space-y-8">{children}</div>
        </div>
      </main>
    </>
  );
}
