import "server-only";

import { and, asc, desc, eq, sql } from "drizzle-orm";

import { db, type Queryable } from "@/lib/db";
import { isUniqueViolation } from "@/lib/db/errors";
import { announcements, pollOptions, polls, votes } from "@/lib/db/schema";
import { bumpMetric } from "@/lib/domain/analytics";
import { notifyApprovedAccounts } from "@/lib/domain/notifications";
import { BadRequestError, ConflictError, NotFoundError } from "@/lib/errors";

/**
 * Polls.
 *
 * A question, fixed options, one vote per person. No free text anywhere, by
 * design: nothing here ever needs moderation.
 *
 * A poll never stands on its own: it hangs off the announcement that carries
 * it, so the community reads one feed and the administration writes in one
 * place. Everything here is reached through `domain/announcements`, except the
 * vote itself and the one open question the home page shows.
 */

export type PollView = {
  id: string;
  question: string;
  /** Whether the question is open. One poll is open at a time. */
  active: boolean;
  /** Closed either by hand or by its own end date. Nothing left to vote on. */
  closed: boolean;
  endsAt: Date | null;
  totalVotes: number;
  /** Option id the current visitor picked, when they voted. */
  votedOptionId: string | null;
  options: { id: string; label: string; votes: number; share: number }[];
};

export async function activePoll(accountId?: string): Promise<PollView | null> {
  const [poll] = await db()
    .select({ id: polls.id })
    .from(polls)
    // A poll is an announcement asking something (see ADR 0011), so it is only
    // live while the note carrying it is. Asked here as well as when the note
    // is taken back, because a note can also be withdrawn by other means.
    .innerJoin(announcements, eq(announcements.id, polls.announcementId))
    .where(
      and(
        eq(polls.active, true),
        eq(announcements.published, true),
        sql`(${polls.startsAt} IS NULL OR ${polls.startsAt} <= now())`,
        sql`(${polls.endsAt} IS NULL OR ${polls.endsAt} > now())`,
      ),
    )
    .orderBy(desc(polls.createdAt))
    .limit(1);

  return poll ? pollView(poll.id, accountId) : null;
}

export async function pollView(
  pollId: string,
  accountId?: string,
): Promise<PollView> {
  const [poll] = await db()
    .select()
    .from(polls)
    .where(eq(polls.id, pollId))
    .limit(1);
  if (!poll) throw new NotFoundError("error.pollNotFound");

  // One grouped query rather than a count per option: the tally has to come
  // from a single snapshot, or a vote landing mid-read shows a total that does
  // not match the bars under it.
  const options = await db()
    .select({
      id: pollOptions.id,
      label: pollOptions.label,
      votes: sql<number>`count(${votes.id})::int`,
    })
    .from(pollOptions)
    .leftJoin(votes, eq(votes.optionId, pollOptions.id))
    .where(eq(pollOptions.pollId, pollId))
    .groupBy(pollOptions.id, pollOptions.label, pollOptions.position)
    .orderBy(asc(pollOptions.position));

  const totalVotes = options.reduce((total, option) => total + option.votes, 0);

  let votedOptionId: string | null = null;
  if (accountId) {
    const [own] = await db()
      .select({ optionId: votes.optionId })
      .from(votes)
      .where(and(eq(votes.pollId, pollId), eq(votes.accountId, accountId)))
      .limit(1);
    votedOptionId = own?.optionId ?? null;
  }

  return {
    id: poll.id,
    question: poll.question,
    active: poll.active,
    closed: isClosed(poll),
    endsAt: poll.endsAt,
    totalVotes,
    votedOptionId,
    options: options.map((option) => ({
      ...option,
      share: totalVotes > 0 ? option.votes / totalVotes : 0,
    })),
  };
}

/** A question stops taking votes when it is closed by hand or runs out. */
function isClosed(poll: { active: boolean; endsAt: Date | null }) {
  return (
    !poll.active ||
    (poll.endsAt !== null && poll.endsAt.getTime() <= Date.now())
  );
}

/**
 * Records a vote, or moves one already cast.
 *
 * The one vote per person rule is a unique index, so a person holds a single
 * row and changing their mind moves that row rather than adding another.
 */
export async function castVote(
  pollId: string,
  optionId: string,
  accountId: string,
) {
  const [option] = await db()
    .select({ id: pollOptions.id })
    .from(pollOptions)
    .where(and(eq(pollOptions.id, optionId), eq(pollOptions.pollId, pollId)))
    .limit(1);
  if (!option) throw new BadRequestError("error.invalidOption");

  const [poll] = await db()
    .select({ active: polls.active, endsAt: polls.endsAt })
    .from(polls)
    .where(eq(polls.id, pollId))
    .limit(1);
  if (!poll) throw new NotFoundError("error.pollNotFound");
  if (isClosed(poll)) throw new ConflictError("error.pollClosed");

  const [existing] = await db()
    .select({ id: votes.id, optionId: votes.optionId })
    .from(votes)
    .where(and(eq(votes.pollId, pollId), eq(votes.accountId, accountId)))
    .limit(1);

  if (existing) {
    // Moving a vote is not a new vote: the tally counts people, and the
    // metric counts the act of taking part, which already happened.
    if (existing.optionId !== optionId)
      await db()
        .update(votes)
        .set({ optionId })
        .where(eq(votes.id, existing.id));
    return pollView(pollId, accountId);
  }

  try {
    await db().insert(votes).values({ pollId, optionId, accountId });
    await bumpMetric("votes_cast");
  } catch (error) {
    // The unique index is what actually enforces one row per person; when two
    // clicks race, the one that lost simply moves the row it did not write.
    if (!isUniqueViolation(error)) throw error;
    await db()
      .update(votes)
      .set({ optionId })
      .where(and(eq(votes.pollId, pollId), eq(votes.accountId, accountId)));
  }

  return pollView(pollId, accountId);
}

/**
 * Hangs a question off a note.
 *
 * Called from `domain/announcements` when a note is written with a question on
 * it: there is no way to create a poll without the announcement that carries
 * it, which is what keeps the two from drifting into separate feeds again.
 */
export async function attachPoll(
  input: {
    announcementId: string;
    question: string;
    options: string[];
    active?: boolean;
    endsAt?: Date | null;
  },
  /** The transaction to write in, when the caller has one. */
  on: Queryable = db(),
) {
  const labels = input.options.map((label) => label.trim()).filter(Boolean);
  if (labels.length < 2) throw new BadRequestError("error.pollNeedsTwoOptions");

  /*
   * A question and its answers are one thing.
   *
   * Written apart, a failure between the two left a poll with no options: a
   * question on the home page that nobody could answer and that no page had
   * any way to take back.
   */
  return on.transaction(async (tx) => {
    // Only one poll is active at a time: activating a new one closes the others.
    if (input.active)
      await tx
        .update(polls)
        .set({ active: false })
        .where(eq(polls.active, true));

    const [poll] = await tx
      .insert(polls)
      .values({
        announcementId: input.announcementId,
        question: input.question.trim(),
        active: input.active ?? false,
        startsAt: new Date(),
        endsAt: input.endsAt ?? null,
      })
      .returning({ id: polls.id });

    await tx
      .insert(pollOptions)
      .values(
        labels.map((label, position) => ({ pollId: poll.id, label, position })),
      );

    return poll;
  });
}

/**
 * Opens or closes a question.
 *
 * `notify` is off when the change rides on the publication of the note that
 * carries the poll: that publication already rang the bell, and one act should
 * not arrive twice.
 */
export async function setPollActive(
  pollId: string,
  active: boolean,
  options: { notify?: boolean } = {},
) {
  /*
   * Closing the others and opening this one are one move.
   *
   * Apart, a question that turned out not to exist left the community with no
   * open question at all: the first statement had already closed the one that
   * was running.
   */
  const [row] = await db().transaction(async (tx) => {
    if (active)
      await tx
        .update(polls)
        .set({ active: false })
        .where(eq(polls.active, true));

    return tx
      .update(polls)
      .set({ active })
      .where(eq(polls.id, pollId))
      .returning({
        id: polls.id,
        active: polls.active,
        question: polls.question,
      });
  });
  if (!row) throw new NotFoundError("error.pollNotFound");

  // Opening a poll is worth an entry; closing one is not, since there is
  // nothing left to do about it.
  if (active && options.notify !== false)
    await notifyApprovedAccounts({
      kind: "poll_open",
      subjectId: row.id,
      step: "open",
      payload: { title: row.question },
    });

  return row;
}

export async function deletePoll(pollId: string) {
  const [row] = await db()
    .delete(polls)
    .where(eq(polls.id, pollId))
    .returning({ id: polls.id });
  if (!row) throw new NotFoundError("error.pollNotFound");
  return row;
}
