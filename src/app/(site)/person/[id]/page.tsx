import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BackLink } from "@/components/back-link";
import { BackToTop } from "@/components/back-to-top";
import { EmptyNote } from "@/components/empty-note";
import { PersonIcon } from "@/components/icons";
import { Poster } from "@/components/poster";
import { Shelf } from "@/components/shelf";
import { currentAccount, requireMemberPage } from "@/lib/auth/session";
import { personPage } from "@/lib/domain/people";
import { getI18n } from "@/lib/i18n/server";

/** Same reasoning as a title: the tab names the person, once signed in. */
export async function generateMetadata({
  params,
}: PageProps<"/person/[id]">): Promise<Metadata> {
  const account = await currentAccount();
  if (!account) return {};

  const { id } = await params;
  if (!/^\d+$/.test(id)) return {};

  const { locale } = await getI18n();
  const person = await personPage(id, locale).catch(() => null);
  return person ? { title: person.name } : {};
}

/**
 * One person, and their work as shelves by what they did on it.
 *
 * Reached from a title's byline or cast, it is the way to follow a director or
 * an actor from one title to the next. Every card still carries its state, so
 * "what else did they make that is already here" is answered at a glance.
 */
export default async function PersonPage({
  params,
}: PageProps<"/person/[id]">) {
  await requireMemberPage();
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();

  const { t, locale } = await getI18n();
  const person = await personPage(id, locale);

  return (
    <div className="umbra-container max-w-6xl space-y-6 py-8 sm:py-12">
      <BackLink fallback="/discover" />
      <div className="space-y-10 sm:space-y-12">
        <header className="flex items-end gap-5">
          <div className="w-24 shrink-0 sm:w-32">
            <Poster
              src={person.photoUrl}
              alt={person.name}
              captioned
              sizes="8rem"
              priority
            />
          </div>
          <h1 className="min-w-0 text-3xl leading-snug tracking-tight text-balance sm:text-4xl">
            {person.name}
          </h1>
        </header>

        {person.groups.length > 0 ? (
          person.groups.map((group, index) => (
            <Shelf
              key={group.role}
              title={t(`person.role.${group.role}`)}
              items={group.titles}
              delayMs={index * 80}
              priority={index === 0}
            />
          ))
        ) : (
          <EmptyNote icon={PersonIcon}>{t("person.empty")}</EmptyNote>
        )}
      </div>
      <BackToTop />
    </div>
  );
}
