import { AdminShell } from "@/components/admin/admin-shell";
import { SiteHeader } from "@/components/site-header";
import { requireStaffPage } from "@/lib/auth/session";
import { adminCounts } from "@/lib/domain/admin";

/**
 * The administration side.
 *
 * The member pages are a place to look at things; this is a desk. It keeps the
 * site header, so the bell, the theme and the way home stay where they always
 * are, and adds a column of sections carrying what is waiting behind each one.
 *
 * The counts are read here, once, and stay true because every write on these
 * screens goes through `ActionButton`, which refreshes the route including this
 * layout. Access is checked here and again in every page: a layout does not
 * stop the page under it from rendering, and is not re-run on a navigation
 * between two admin pages.
 */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const viewer = await requireStaffPage();
  const isAdmin = viewer.role === "admin";
  const counts = await adminCounts(isAdmin);

  return (
    <>
      <SiteHeader narrow full />
      <AdminShell counts={counts} isAdmin={isAdmin}>
        {children}
      </AdminShell>
    </>
  );
}
