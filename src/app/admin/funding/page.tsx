import { redirect } from "next/navigation";

/**
 * The funding goal is gone: a fundraiser is an address elsewhere, and an
 * address elsewhere is an announcement carrying a link, not a number Umbra
 * keeps a ledger for (see `docs/adr/0010-no-funding-goal.md`).
 */
export default function AdminFundingPage() {
  redirect("/admin/announcements");
}
