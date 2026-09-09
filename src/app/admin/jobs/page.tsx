import { redirect } from "next/navigation";

/**
 * The jobs panel became the synchronisation page, named after what it is for
 * rather than after the code behind it. The address stays alive because it is
 * in bookmarks and in the deployment notes.
 */
export default function AdminJobsPage() {
  redirect("/admin/sync");
}
