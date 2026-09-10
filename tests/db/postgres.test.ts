import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { eq } from "drizzle-orm";

import { emptyDatabase, hasDatabase, prepareDatabase } from "./harness";

/**
 * What only a database can answer.
 *
 * The rest of the suite is pure rules, which is why it runs anywhere. The rules
 * below are written in SQL, and they are the ones that went wrong: a status that
 * could move backwards, presence that could only ever become true. They are in
 * one file on purpose, since two files would be two workers emptying the same
 * database at the same moment.
 *
 * Skipped unless `UMBRA_TEST_DATABASE_URL` points at a database they may empty.
 */

let db: typeof import("@/lib/db").db;
let schema: typeof import("@/lib/db/schema");
let requests: typeof import("@/lib/domain/requests");
let series: typeof import("@/lib/domain/series");
let session: typeof import("@/lib/auth/session");

beforeAll(async () => {
  if (!hasDatabase) return;
  await prepareDatabase();
  // Imported after the environment is set: the pool reads it on first use.
  ({ db } = await import("@/lib/db"));
  schema = await import("@/lib/db/schema");
  requests = await import("@/lib/domain/requests");
  series = await import("@/lib/domain/series");
  session = await import("@/lib/auth/session");
});

/**
 * The request lifecycle, against the table it lives in.
 *
 * The graph in `docs/product.md` only ever moves forward, and it used to be a
 * drawing rather than a rule: every status was accepted from every status. This
 * is the regression test for the two moves that did real damage.
 */
describe.skipIf(!hasDatabase)("moving a request", () => {
  beforeEach(emptyDatabase);

  /** A film nobody has to fetch from a provider, and somebody asking for it. */
  async function openRequest() {
    const [account] = await db()
      .insert(schema.accounts)
      .values({
        plexAccountId: "test:1",
        username: "test",
      })
      .returning({ id: schema.accounts.id });

    const [film] = await db()
      .insert(schema.media)
      .values({ providerId: "1", mediaType: "movie", title: "Alien" })
      .returning({ id: schema.media.id });

    const [request] = await db()
      .insert(schema.mediaRequests)
      .values({ mediaId: film.id, requestedBy: account.id })
      .returning({ id: schema.mediaRequests.id });
    await db()
      .insert(schema.requestFollowers)
      .values({ requestId: request.id, accountId: account.id });

    return { accountId: account.id, mediaId: film.id, requestId: request.id };
  }

  it("walks the lifecycle forwards", async () => {
    const { requestId } = await openRequest();

    const accepted = await requests.updateRequestStatus(
      requestId,
      "accepted",
      "looking for a good copy",
    );
    expect(accepted.status).toBe("accepted");
    expect(accepted.adminNote).toBe("looking for a good copy");

    const processing = await requests.updateRequestStatus(
      requestId,
      "processing",
    );
    expect(processing.status).toBe("processing");
  });

  it("refuses to hand a fulfilled request back to the queue", async () => {
    const { requestId, mediaId } = await openRequest();

    // `available` is only allowed once the index has seen the title, which is
    // the rule the administration cannot talk its way past.
    await expect(
      requests.updateRequestStatus(requestId, "available"),
    ).rejects.toThrow(/notOnServerYet/);

    await db().insert(schema.libraryItems).values({
      ratingKey: "plex:1",
      kind: "movie",
      title: "Alien",
      tmdbId: "1",
    });
    void mediaId;

    const done = await requests.updateRequestStatus(requestId, "available");
    expect(done.status).toBe("available");

    await expect(
      requests.updateRequestStatus(requestId, "requested"),
    ).rejects.toThrow(/illegalTransition/);
  });

  it("refuses to revive a refusal, which the unique index would fail on", async () => {
    const { requestId, mediaId, accountId } = await openRequest();

    await requests.updateRequestStatus(requestId, "rejected");

    // The title is askable again, so somebody does ask: the refused row and
    // this one now both exist, and only the live one may be in the index.
    await db()
      .insert(schema.mediaRequests)
      .values({ mediaId, requestedBy: accountId });

    await expect(
      requests.updateRequestStatus(requestId, "accepted"),
    ).rejects.toThrow(/illegalTransition/);
  });

  /*
   * Two people on the queue pressing the same button, or one person pressing
   * it twice. Whichever it is, the second move is the first one again, and
   * taking it would tell the member about a step they were told about already.
   */
  it("takes one decision when the same one is sent twice", async () => {
    const { requestId } = await openRequest();

    const outcomes = await Promise.allSettled([
      requests.updateRequestStatus(requestId, "accepted"),
      requests.updateRequestStatus(requestId, "accepted"),
    ]);

    expect(outcomes.filter((one) => one.status === "fulfilled")).toHaveLength(
      1,
    );
    const refused = outcomes.find((one) => one.status === "rejected");
    expect(String(refused?.reason)).toMatch(/illegalTransition/);
  });

  it("pages the queue rather than reading all of it", async () => {
    const { mediaId, accountId } = await openRequest();
    for (let index = 2; index <= 5; index += 1) {
      const [film] = await db()
        .insert(schema.media)
        .values({
          providerId: String(index),
          mediaType: "movie",
          title: `Film ${index}`,
        })
        .returning({ id: schema.media.id });
      await db()
        .insert(schema.mediaRequests)
        .values({ mediaId: film.id, requestedBy: accountId });
    }
    void mediaId;

    expect(await requests.countRequests()).toBe(5);
    const page = await requests.listRequests(undefined, {
      limit: 2,
      offset: 0,
    });
    expect(page).toHaveLength(2);
  });
});

/**
 * Several members wanting the same title.
 *
 * The queue holds one row per title, and everybody who asked is waiting on it:
 * a second ask joins rather than being refused, every step reaches everyone,
 * and leaving keeps the request alive for whoever stays.
 */
describe.skipIf(!hasDatabase)("sharing a request", () => {
  beforeEach(emptyDatabase);

  async function member(id: number) {
    const [account] = await db()
      .insert(schema.accounts)
      .values({
        plexAccountId: `test:${id}`,
        username: `member${id}`,
      })
      .returning({ id: schema.accounts.id });
    return account.id;
  }

  /** A film on the list, asked for by the first member. */
  async function askedFilm() {
    const first = await member(1);
    const [film] = await db()
      .insert(schema.media)
      .values({ providerId: "1", mediaType: "movie", title: "Alien" })
      .returning({ id: schema.media.id });
    const [request] = await db()
      .insert(schema.mediaRequests)
      .values({ mediaId: film.id, requestedBy: first })
      .returning({ id: schema.mediaRequests.id });
    await db()
      .insert(schema.requestFollowers)
      .values({ requestId: request.id, accountId: first });
    return { first, requestId: request.id };
  }

  it("joins the live request instead of refusing a second member", async () => {
    const { requestId } = await askedFilm();
    const second = await member(2);

    const outcome = await requests.createRequest("movie", "1", second);
    expect(outcome).toMatchObject({ requestId, joined: true });

    // Asking twice is still one person waiting.
    await requests.createRequest("movie", "1", second);

    const [row] = await requests.listRequests();
    expect(row.waiting).toBe(2);
    expect(await requests.countRequests()).toBe(1);
    expect(await requests.countRequestsBy(second)).toBe(1);
  });

  it("tells everyone waiting about each step", async () => {
    const { requestId } = await askedFilm();
    const second = await member(2);
    await requests.createRequest("movie", "1", second);

    await requests.updateRequestStatus(requestId, "accepted");

    const told = await db()
      .select({ accountId: schema.notifications.accountId })
      .from(schema.notifications)
      .where(eq(schema.notifications.subjectId, requestId));
    expect(told).toHaveLength(2);
  });

  it("keeps the request for those who stay, and hands it on", async () => {
    const { first, requestId } = await askedFilm();
    const second = await member(2);
    await requests.createRequest("movie", "1", second);

    const left = await requests.withdrawRequest(requestId, first);
    expect(left.removed).toBe(false);

    const [row] = await requests.listRequests();
    expect(row.waiting).toBe(1);
    expect(row.requestedBy).toBe("member2");

    // The last one leaving an untouched request takes it away with them.
    const last = await requests.withdrawRequest(requestId, second);
    expect(last.removed).toBe(true);
    expect(await requests.countRequests()).toBe(0);
  });

  it("refuses to leave once the request is taken up", async () => {
    const { first, requestId } = await askedFilm();
    await requests.updateRequestStatus(requestId, "accepted");

    await expect(requests.withdrawRequest(requestId, first)).rejects.toThrow(
      /requestUnderway/,
    );
  });
});

/**
 * Reconciliation, against the tables it compares.
 *
 * Presence used to be a one-way door: an episode marked available stayed
 * available after its file was deleted, so no task came back and a report
 * saying the series was behind could settle itself against a calendar that
 * claimed everything was there. Both directions are asserted here.
 */
describe.skipIf(!hasDatabase)("reconciling episodes", () => {
  beforeEach(emptyDatabase);

  const AIRED = "2026-01-06";
  const SCHEDULED = "2099-01-06";

  /** A tracked show whose entry on the server is known, and two episodes. */
  async function trackedShow() {
    const [show] = await db()
      .insert(schema.media)
      .values({ providerId: "42", mediaType: "tv", title: "Cowboy Bebop" })
      .returning({ id: schema.media.id });

    const [tracked] = await db()
      .insert(schema.trackedSeries)
      .values({ mediaId: show.id, plexRatingKey: "show:42", enabled: true })
      .returning({ id: schema.trackedSeries.id });

    await db()
      .insert(schema.episodes)
      .values([
        {
          seriesId: tracked.id,
          seasonNumber: 1,
          episodeNumber: 1,
          airDate: AIRED,
        },
        {
          seriesId: tracked.id,
          seasonNumber: 1,
          episodeNumber: 2,
          airDate: SCHEDULED,
        },
      ]);

    return { seriesId: tracked.id };
  }

  /** The index row the media server's sync would have written. */
  async function indexEpisode(episodeNumber: number) {
    await db()
      .insert(schema.libraryItems)
      .values({
        ratingKey: `episode:${episodeNumber}`,
        kind: "episode",
        title: `Episode ${episodeNumber}`,
        grandparentRatingKey: "show:42",
        seasonNumber: 1,
        episodeNumber,
      });
  }

  async function statuses(seriesId: string) {
    const rows = await db()
      .select({
        episodeNumber: schema.episodes.episodeNumber,
        status: schema.episodes.status,
        available: schema.episodes.plexAvailable,
      })
      .from(schema.episodes)
      .orderBy(schema.episodes.episodeNumber);
    void seriesId;
    return rows;
  }

  it("marks what has aired and is absent, and leaves the future alone", async () => {
    const { seriesId } = await trackedShow();

    const result = await series.reconcileEpisodes();
    expect(result.tasksOpened).toBe(1);

    expect(await statuses(seriesId)).toEqual([
      { episodeNumber: 1, status: "aired_missing", available: false },
      { episodeNumber: 2, status: "scheduled", available: false },
    ]);
  });

  it("closes the task when the episode arrives", async () => {
    const { seriesId } = await trackedShow();
    await series.reconcileEpisodes();

    await indexEpisode(1);
    await series.reconcileEpisodes();

    expect(await statuses(seriesId)).toEqual([
      { episodeNumber: 1, status: "available", available: true },
      { episodeNumber: 2, status: "scheduled", available: false },
    ]);

    const tasks = await db()
      .select({ status: schema.episodeTasks.status })
      .from(schema.episodeTasks);
    expect(tasks).toEqual([{ status: "done" }]);
  });

  it("takes presence back when the episode goes away again", async () => {
    const { seriesId } = await trackedShow();
    await indexEpisode(1);
    await series.reconcileEpisodes();

    // The file is deleted from the storage page, so the next sync drops the
    // index row and this pass has to notice.
    await db().delete(schema.libraryItems);
    await series.reconcileEpisodes();

    expect(await statuses(seriesId)).toEqual([
      { episodeNumber: 1, status: "aired_missing", available: false },
      { episodeNumber: 2, status: "scheduled", available: false },
    ]);

    // There is one task per episode for its whole life, so the closed one is
    // what has to carry the shortfall a second time.
    const tasks = await db()
      .select({ status: schema.episodeTasks.status })
      .from(schema.episodeTasks);
    expect(tasks).toEqual([{ status: "open" }]);
  });

  it("leaves a series it has no server entry for alone", async () => {
    const [show] = await db()
      .insert(schema.media)
      .values({ providerId: "43", mediaType: "tv", title: "Unlinked" })
      .returning({ id: schema.media.id });
    const [tracked] = await db()
      .insert(schema.trackedSeries)
      .values({ mediaId: show.id, plexRatingKey: null })
      .returning({ id: schema.trackedSeries.id });
    await db().insert(schema.episodes).values({
      seriesId: tracked.id,
      seasonNumber: 1,
      episodeNumber: 1,
      airDate: AIRED,
      plexAvailable: true,
      status: "available",
    });

    await series.reconcileEpisodes();

    // Nothing to compare against is not the same as an absence: a show whose
    // key the sync has not found yet must not have its calendar emptied.
    expect(await statuses(tracked.id)).toEqual([
      { episodeNumber: 1, status: "available", available: true },
    ]);
  });
});

/**
 * Signing in, which is one statement because it cannot be a conversation.
 *
 * Read first and written after, two browsers finishing the same first sign-in
 * in the same instant both saw no account, both inserted one, and the second
 * was refused by the unique index on the way in.
 */
describe.skipIf(!hasDatabase)("signing in with a Plex account", () => {
  beforeEach(emptyDatabase);

  const visitor = { id: "plex:99", username: "kisuke" };

  it("creates a member once and finds it again", async () => {
    const first = await session.upsertAccountFromPlex(visitor);
    expect(first.role).toBe("member");

    const again = await session.upsertAccountFromPlex(visitor);
    expect(again.id).toBe(first.id);
  });

  it("survives two first sign-ins landing together", async () => {
    const [one, two] = await Promise.all([
      session.upsertAccountFromPlex(visitor),
      session.upsertAccountFromPlex(visitor),
    ]);
    expect(one.id).toBe(two.id);

    const rows = await db().select().from(schema.accounts);
    expect(rows).toHaveLength(1);
  });

  it("keeps the role and brings the name up to date", async () => {
    const created = await session.upsertAccountFromPlex(visitor);
    await db()
      .update(schema.accounts)
      .set({ role: "assistant" })
      .where(eq(schema.accounts.id, created.id));

    const back = await session.upsertAccountFromPlex({
      ...visitor,
      username: "kisuke-renamed",
    });
    // The role somebody was given is not handed back by signing in again.
    expect(back.role).toBe("assistant");
    expect(back.username).toBe("kisuke-renamed");
  });
});
