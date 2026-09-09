import type { Metadata } from "next";

import { PollCard } from "@/components/poll-card";
import { requireMemberPage } from "@/lib/auth/session";
import { activePoll } from "@/lib/domain/polls";
import { getTranslator } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Polls" };

export default async function PollsPage() {
  const account = await requireMemberPage();
  const [poll, t] = await Promise.all([
    activePoll(account?.id),
    getTranslator(),
  ]);

  return (
    <div className="umbra-container max-w-xl py-12">
      <h1 className="mb-8 text-3xl tracking-tight sm:text-4xl">
        {t("nav.polls")}
      </h1>
      <PollCard poll={poll} />
    </div>
  );
}
