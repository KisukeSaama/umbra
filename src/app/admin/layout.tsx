import { AdminHeading, AdminNav } from "@/components/admin/admin-nav";
import { SiteHeader } from "@/components/site-header";
import { requireStaffPage } from "@/lib/auth/session";

/**
 * The administration side.
 *
 * Same shell as the public site, one column narrower: this is a workspace, not
 * a dashboard to admire. Access is checked here and again in every page: a
 * layout does not stop the page under it from rendering, and is not re-run
 * on a navigation between two admin pages.
 */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const viewer = await requireStaffPage();

  return (
    <>
      <SiteHeader />
      <main className="umbra-container flex-1 py-12">
        <AdminHeading />
        <div className="grid gap-8 lg:grid-cols-[12rem_1fr]">
          <AdminNav isAdmin={viewer.role === "admin"} />
          <div className="min-w-0 space-y-8">{children}</div>
        </div>
      </main>
    </>
  );
}
