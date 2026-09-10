import type { MediaKind, MediaSummary } from "@/lib/providers/metadata";

/**
 * Suggestions seeded on titles rather than on genres.
 *
 * A genre says almost nothing about why somebody liked a film: two titles filed
 * under Drama can have nothing in common. A title does, and the provider already
 * knows which titles its own audience watches together. So the shelf asks the
 * provider what goes with each of the last things a member watched, and keeps
 * what several of those answers agree on. A title recommended from five films
 * you chose is a better guess than one that shares a label with them.
 *
 * Counting and sorting, nothing learned: the module is pure arithmetic over a
 * few hundred rows, so it costs nothing on the server and is unit tested the way
 * the moods are.
 */

/**
 * How many recent titles the shelf asks about. Each one is a provider call,
 * answered by the gateway's cache after the first, and a saga watched in a row
 * takes several of them, which is why the number is not smaller.
 */
export const SEED_COUNT = 16;

/** How much each step back in the history weakens a seed. */
export const RECENCY_DECAY = 0.9;

/**
 * How much a place further down one provider list weakens a candidate. The
 * provider orders its own list, and its first answers are its surest.
 */
export const POSITION_DECAY = 0.08;

/**
 * How hard the most voted titles are pulled back.
 *
 * Every recommendation list leans towards the same famous films, since they are
 * watched alongside everything. Without this the shelf converges on the canon
 * whatever the seeds were. It is a gentle pull: thirty thousand votes costs a
 * title about a third of its score against a few hundred, which a title backed
 * by two more seeds than its rival still wins.
 */
export const POPULARITY_DAMPING = 0.08;

/**
 * How much a title gains from appearing often in the window.
 *
 * An entry is an episode as much as a film, so a show followed for fifty
 * episodes has fifty entries against one for a film seen once. Counted at full
 * strength that made every series outweigh every film several times over, and
 * the shelf became four cards per show. At this rate fifty episodes weigh about
 * twice one film: a show followed long enough is a strong signal, not the only
 * one.
 */
export const PLAYS_BONUS = 0.25;

/** At most this many cards owe their place to the same seed, or saga. */
export const PER_SEED = 3;

/** Below this, the score behind a title is a handful of opinions. */
export const MIN_VOTES = 100;

export const SHELF_SIZE = 18;

export type SeedTitle = { kind: MediaKind; providerId: string };

export type Seed = SeedTitle & {
  /** How many times this title appears in the window: episodes, rewatches. */
  plays: number;
  weight: number;
};

export type SeedAnswer = { seed: Seed; items: MediaSummary[] };

export function keyOf(title: SeedTitle): string {
  return `${title.kind}:${title.providerId}`;
}

/**
 * The seeds, from a history ordered most recent first.
 *
 * A title counts once however many entries it has, at the place of its most
 * recent one, and the entries it has make it heavier: a show followed for
 * twenty episodes says more than a film started once. The count is damped so
 * that a long series cannot drown everything else out.
 */
export function seedsFrom(history: SeedTitle[], count = SEED_COUNT): Seed[] {
  const plays = new Map<string, number>();
  const order: SeedTitle[] = [];
  for (const title of history) {
    const key = keyOf(title);
    const seen = plays.get(key);
    if (seen === undefined) order.push(title);
    plays.set(key, (seen ?? 0) + 1);
  }

  return order.slice(0, count).map((title, rank) => {
    const times = plays.get(keyOf(title)) ?? 1;
    return {
      ...title,
      plays: times,
      weight: RECENCY_DECAY ** rank * (1 + PLAYS_BONUS * Math.log(times)),
    };
  });
}

/**
 * Whether a provider row may be put forward by Umbra on its own.
 *
 * The same bar the other shelves hold: a score above the floor, enough votes
 * behind it for the score to mean something, and a poster, since a card without
 * one reads as a fault rather than a suggestion.
 */
export function worthSuggesting(
  item: MediaSummary,
  ratingFloor: number,
): boolean {
  return (
    item.posterPath !== null &&
    item.voteAverage !== null &&
    item.voteAverage >= ratingFloor &&
    item.voteCount >= MIN_VOTES
  );
}

/**
 * Seeds that are one taste rather than several.
 *
 * Four films of one saga watched in a row are not four people agreeing: they
 * all return the same list, and counted apart they would crown whatever that
 * list holds. The provider gives the saga away for free, since its films
 * recommend each other, so two seeds are joined whenever one appears in the
 * other's answer. No extra call, and a remake or a spin-off the provider sees
 * as close is joined the same way, which is the point.
 */
export function sagasOf(answers: SeedAnswer[]): Map<string, string> {
  const parent = new Map<string, string>();
  for (const { seed } of answers) parent.set(keyOf(seed), keyOf(seed));

  const root = (key: string): string => {
    let current = key;
    while (parent.get(current) !== current) current = parent.get(current)!;
    return current;
  };

  for (const { seed, items } of answers) {
    for (const item of items) {
      const other = keyOf(item);
      if (!parent.has(other)) continue;
      const [a, b] = [root(keyOf(seed)), root(other)];
      if (a !== b) parent.set(b, a);
    }
  }

  return new Map([...parent.keys()].map((key) => [key, root(key)]));
}

/**
 * A few entries drawn from the head of a ranked list.
 *
 * The picker answers from a ranking that does not move between two rolls, and
 * a second roll has to be a second answer. Drawing among the first few keeps
 * the answer close to the top while letting it change.
 */
export function sampleTop<T>(
  list: T[],
  count: number,
  pool: number,
  random: () => number = Math.random,
): T[] {
  const head = list.slice(0, Math.max(count, pool));
  for (let index = head.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [head[index], head[other]] = [head[other], head[index]];
  }
  return head.slice(0, count);
}

type Tally = {
  item: MediaSummary;
  /** The best share each saga gave this candidate. A saga votes once. */
  bySaga: Map<string, number>;
};

/**
 * Merges the answers into one ranked shelf.
 *
 * A candidate earns, from every saga that proposed it, the best of that saga's
 * seed weight times how high the provider placed it. Anything already watched
 * in the window is left out, the seeds included, and so is anything below the
 * bar. Then the famous titles are pulled back a little, and no saga may fill
 * more than a few cards, so one binge does not become the whole shelf.
 */
export function blend(
  answers: SeedAnswer[],
  {
    watched,
    ratingFloor,
    size = SHELF_SIZE,
    perSeed = PER_SEED,
  }: {
    watched: Set<string>;
    ratingFloor: number;
    size?: number;
    /** The picker filters afterwards, so it asks for the whole ranking. */
    perSeed?: number;
  },
): MediaSummary[] {
  const saga = sagasOf(answers);
  const tallies = new Map<string, Tally>();

  for (const { seed, items } of answers) {
    const group = saga.get(keyOf(seed)) ?? keyOf(seed);
    items.forEach((item, position) => {
      const key = keyOf(item);
      if (watched.has(key) || !worthSuggesting(item, ratingFloor)) return;

      const share = seed.weight / (1 + position * POSITION_DECAY);
      const tally = tallies.get(key) ?? { item, bySaga: new Map() };
      tally.bySaga.set(group, Math.max(tally.bySaga.get(group) ?? 0, share));
      tallies.set(key, tally);
    });
  }

  const ranked = [...tallies.values()]
    .map(({ item, bySaga }) => {
      let total = 0;
      let lead = "";
      let leadShare = -1;
      for (const [group, share] of bySaga) {
        total += share;
        if (share > leadShare) [lead, leadShare] = [group, share];
      }
      return {
        item,
        lead,
        score: total / (item.voteCount + 1) ** POPULARITY_DAMPING,
      };
    })
    .sort((a, b) => b.score - a.score);

  const perSaga = new Map<string, number>();
  const shelf: MediaSummary[] = [];
  for (const entry of ranked) {
    if (shelf.length >= size) break;
    const used = perSaga.get(entry.lead) ?? 0;
    if (used >= perSeed) continue;
    perSaga.set(entry.lead, used + 1);
    shelf.push(entry.item);
  }
  return shelf;
}
