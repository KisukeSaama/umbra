import type { Metadata } from "next";

import { ActionButton } from "@/components/admin/action-button";
import { AnnouncementForm } from "@/components/admin/announcement-form";
import { formatPercent } from "@/components/formatting";
import { ExternalLinkIcon, PollIcon } from "@/components/icons";
import { Pagination } from "@/components/pagination";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { requireStaffPage } from "@/lib/auth/session";
import {
  countAllAnnouncements,
  listAllAnnouncements,
} from "@/lib/domain/announcements";
import { formatDate } from "@/lib/format";
import { plainText } from "@/lib/markdown";
import type { TranslationKey } from "@/lib/i18n";
import { getI18n, getTranslator } from "@/lib/i18n/server";
import { paginate, parsePage, toSearchParams } from "@/lib/pagination";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslator();
  return { title: t("meta.admin", { section: t("admin.nav.announcements") }) };
}

/** Notes per page, the same handful the feed on /news shows. */
const PER_PAGE = 10;

/**
 * Everything the administration says, in one place.
 *
 * Polls used to be a section of their own, which meant two composers, two
 * lists and a community reading two feeds for what is one act: telling people
 * something. A question is now a block on the note that carries it, and this
 * page is the whole of it, drafts included.
 *
 * The register is read one page at a time, since it only ever grows and every
 * row carries the buttons that publish, activate and delete. The slice is cut
 * here rather than in the query: `listAllAnnouncements` reads the table whole,
 * and this page does not own the domain layer.
 */
export default async function AdminAnnouncementsPage({
  searchParams,
}: PageProps<"/admin/announcements">) {
  await requireStaffPage();
  const { t, locale } = await getI18n();

  const params = toSearchParams(await searchParams);
  const total = await countAllAnnouncements();
  const page = paginate(total, parsePage(params.get("page")), PER_PAGE);
  const announcements = await listAllAnnouncements({
    limit: page.perPage,
    offset: page.offset,
  });

  return (
    <>
      <AnnouncementForm />

      {total === 0 ? (
        <p className="text-muted-foreground text-sm">{t("news.none")}</p>
      ) : (
        <ul className="space-y-3">
          {announcements.map((announcement) => {
            const poll = announcement.poll;
            return (
              <li key={announcement.id}>
                <Card className="gap-3">
                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium break-words">
                          {announcement.title}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {t(
                            `news.category.${announcement.category}` as TranslationKey,
                          )}
                          {" · "}
                          {formatDate(
                            announcement.publishedAt ?? announcement.createdAt,
                            locale,
                          )}
                        </p>
                      </div>

                      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                        <Badge
                          variant={
                            announcement.published ? "secondary" : "outline"
                          }
                        >
                          {announcement.published
                            ? t("admin.announcements.published")
                            : t("admin.announcements.draft")}
                        </Badge>
                        {poll ? (
                          <Badge variant="outline">
                            <PollIcon />
                            {t("poll.votes", { count: poll.totalVotes })}
                          </Badge>
                        ) : null}
                        {poll?.closed ? (
                          <Badge variant="outline">
                            {t("admin.polls.closed")}
                          </Badge>
                        ) : null}
                      </div>
                    </div>

                    {/* The list is a register, not the feed: the body is
                        summarised without its marks, and read as published on
                        /news. */}
                    <p className="text-muted-foreground line-clamp-3 text-sm">
                      {plainText(announcement.content)}
                    </p>

                    {announcement.link ? (
                      <a
                        href={announcement.link.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-muted-foreground hover:text-primary focus-visible:ring-ring/50 inline-flex max-w-full items-center gap-1.5 rounded-md text-xs transition-colors outline-none focus-visible:ring-3"
                      >
                        <ExternalLinkIcon className="shrink-0" />
                        <span className="truncate">
                          {announcement.link.label ?? announcement.link.url}
                        </span>
                      </a>
                    ) : null}

                    {poll ? (
                      <div className="border-border/60 space-y-1.5 rounded-lg border p-3">
                        <p className="text-sm font-medium">{poll.question}</p>
                        {poll.options.map((option) => (
                          <div
                            key={option.id}
                            className="flex items-center gap-3"
                          >
                            <span className="min-w-0 flex-1 truncate text-xs">
                              {option.label}
                            </span>
                            <span className="bg-secondary h-1.5 w-24 shrink-0 overflow-hidden rounded-full sm:w-40">
                              <span
                                className="bg-muted-foreground/40 block h-full rounded-full"
                                style={{
                                  width: `${Math.round(option.share * 100)}%`,
                                }}
                              />
                            </span>
                            {/* The count first: a share alone hides whether
                                two people or forty made that split. */}
                            <span className="text-muted-foreground w-8 shrink-0 text-right text-xs tabular-nums">
                              {option.votes}
                            </span>
                            <span className="text-muted-foreground w-9 shrink-0 text-right text-xs tabular-nums">
                              {formatPercent(option.share, locale)}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    <div className="flex flex-wrap gap-1.5">
                      {announcement.published ? null : (
                        <ActionButton
                          url={`/api/admin/announcements/${announcement.id}`}
                          body={{ published: true }}
                          size="sm"
                        >
                          {t("admin.announcements.publish")}
                        </ActionButton>
                      )}

                      {poll ? (
                        <ActionButton
                          url={`/api/admin/polls/${poll.id}`}
                          body={{ active: !poll.active }}
                          size="sm"
                          variant="secondary"
                        >
                          {poll.active
                            ? t("admin.polls.deactivate")
                            : t("admin.polls.activate")}
                        </ActionButton>
                      ) : null}

                      <ActionButton
                        url={`/api/admin/announcements/${announcement.id}`}
                        method="DELETE"
                        size="sm"
                        variant="ghost"
                        confirmMessage={t("common.confirmDelete")}
                      >
                        {t("common.delete")}
                      </ActionButton>
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <Pagination
        page={page}
        pathname="/admin/announcements"
        params={params}
        label={t("pagination.announcements")}
      />
    </>
  );
}
