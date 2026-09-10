import type { ReactionValue } from "@/lib/db/schema";

/**
 * The two counts under a note, and what the visitor picked.
 *
 * Pure, so the feed can move the numbers the moment a thumb is pressed and the
 * rules stay testable without a database.
 */
export type ReactionTally = {
  likes: number;
  dislikes: number;
  /** What the current visitor picked, or `null` when they have not reacted. */
  own: ReactionValue | null;
};

export const EMPTY_TALLY: ReactionTally = { likes: 0, dislikes: 0, own: null };

/** Pressing the thumb already held takes it back; the other one moves it. */
export function nextReaction(
  current: ReactionValue | null,
  pressed: ReactionValue,
): ReactionValue | null {
  return current === pressed ? null : pressed;
}

/** The tally once the visitor's reaction becomes `to`. */
export function applyReaction(
  tally: ReactionTally,
  to: ReactionValue | null,
): ReactionTally {
  let { likes, dislikes } = tally;
  if (tally.own === "like") likes -= 1;
  if (tally.own === "dislike") dislikes -= 1;
  if (to === "like") likes += 1;
  if (to === "dislike") dislikes += 1;
  return { likes, dislikes, own: to };
}
