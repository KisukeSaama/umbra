import "server-only";

import { and, desc, eq, ne } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  fundingGoals,
  fundingTransactions,
  type FundingStatus,
} from "@/lib/db/schema";
import { BadRequestError, ConflictError, NotFoundError } from "@/lib/errors";

/**
 * Funding goal.
 *
 * Umbra handles no money: no payment integration, no transaction captured from
 * a provider, no donor identity. A goal is an informational widget the
 * administrator updates by hand, and every change leaves a history entry.
 *
 * Contributing gives no Plex access and no privilege, and the wording on screen
 * must never suggest otherwise.
 */

export type FundingView = {
  id: string;
  title: string;
  description: string | null;
  targetAmountCents: number;
  currentAmountCents: number;
  currency: string;
  status: FundingStatus;
  progress: number;
  updatedAt: Date;
};

export async function activeGoal(): Promise<FundingView | null> {
  const [row] = await db()
    .select()
    .from(fundingGoals)
    .where(eq(fundingGoals.status, "active"))
    .limit(1);
  return row ? toView(row) : null;
}

export async function listGoals(): Promise<FundingView[]> {
  const rows = await db()
    .select()
    .from(fundingGoals)
    .orderBy(desc(fundingGoals.createdAt));
  return rows.map(toView);
}

export async function goalHistory(goalId: string) {
  return db()
    .select({
      id: fundingTransactions.id,
      deltaCents: fundingTransactions.deltaCents,
      note: fundingTransactions.note,
      createdAt: fundingTransactions.createdAt,
    })
    .from(fundingTransactions)
    .where(eq(fundingTransactions.goalId, goalId))
    .orderBy(desc(fundingTransactions.createdAt));
}

export async function createGoal(input: {
  title: string;
  description?: string | null;
  targetAmountCents: number;
  currency?: string;
  status?: FundingStatus;
}) {
  if (input.targetAmountCents <= 0)
    throw new BadRequestError("error.invalidAmount");

  // A single active goal at a time (V1): the database enforces it, we give a
  // readable error rather than a constraint violation.
  if (input.status === "active") await ensureNoActiveGoal();

  const [row] = await db()
    .insert(fundingGoals)
    .values({
      title: input.title.trim(),
      description: input.description?.trim() ?? null,
      targetAmountCents: input.targetAmountCents,
      currency: input.currency ?? "EUR",
      status: input.status ?? "draft",
    })
    .returning({ id: fundingGoals.id });
  return row;
}

export async function updateGoal(
  goalId: string,
  input: Partial<{
    title: string;
    description: string | null;
    targetAmountCents: number;
    status: FundingStatus;
  }>,
) {
  if (input.status === "active") await ensureNoActiveGoal(goalId);

  const [row] = await db()
    .update(fundingGoals)
    .set({
      ...input,
      completedAt: input.status === "completed" ? new Date() : undefined,
      updatedAt: new Date(),
    })
    .where(eq(fundingGoals.id, goalId))
    .returning({ id: fundingGoals.id });
  if (!row) throw new NotFoundError("error.goalNotFound");
  return row;
}

/**
 * Applies a manual adjustment and records it.
 *
 * `deltaCents` may be negative: correcting a mistake is a movement like any
 * other, and both show up in the history.
 */
export async function addTransaction(
  goalId: string,
  deltaCents: number,
  note?: string | null,
) {
  if (!Number.isInteger(deltaCents) || deltaCents === 0) {
    throw new BadRequestError("error.invalidAmount");
  }

  return db().transaction(async (tx) => {
    const [goal] = await tx
      .select()
      .from(fundingGoals)
      .where(eq(fundingGoals.id, goalId))
      .limit(1);
    if (!goal) throw new NotFoundError("error.goalNotFound");

    // The total never goes below zero, whatever correction is entered.
    const current = Math.max(0, goal.currentAmountCents + deltaCents);
    const reached = current >= goal.targetAmountCents;

    await tx
      .insert(fundingTransactions)
      .values({ goalId, deltaCents, note: note ?? null });
    await tx
      .update(fundingGoals)
      .set({
        currentAmountCents: current,
        status: reached && goal.status === "active" ? "completed" : goal.status,
        completedAt:
          reached && !goal.completedAt ? new Date() : goal.completedAt,
        updatedAt: new Date(),
      })
      .where(eq(fundingGoals.id, goalId));

    return { currentAmountCents: current, reached };
  });
}

async function ensureNoActiveGoal(exceptId?: string) {
  const rows = await db()
    .select({ id: fundingGoals.id })
    .from(fundingGoals)
    .where(
      exceptId
        ? and(eq(fundingGoals.status, "active"), ne(fundingGoals.id, exceptId))
        : eq(fundingGoals.status, "active"),
    )
    .limit(1);
  if (rows.length > 0) throw new ConflictError("error.activeGoalExists");
}

function toView(row: typeof fundingGoals.$inferSelect): FundingView {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    targetAmountCents: row.targetAmountCents,
    currentAmountCents: row.currentAmountCents,
    currency: row.currency,
    status: row.status,
    progress:
      row.targetAmountCents > 0
        ? Math.min(1, row.currentAmountCents / row.targetAmountCents)
        : 0,
    updatedAt: row.updatedAt,
  };
}
