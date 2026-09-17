import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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
let reportDomain: typeof import("@/lib/domain/reports");
let library: typeof import("@/lib/domain/library");
let catalog: typeof import("@/lib/domain/catalog");

beforeAll(async () => {
  if (!hasDatabase) return;
  await prepareDatabase();
  // Imported after the environment is set: the pool reads it on first use.
  ({ db } = await import("@/lib/db"));
  schema = await import("@/lib/db/schema");
  requests = await import("@/lib/domain/requests");
  series = await import("@/lib/domain/series");
  session = await import("@/lib/auth/session");
  reportDomain = await import("@/lib/domain/reports");
  library = await import("@/lib/domain/library");
  catalog = await import("@/lib/domain/catalog");
});

describe.skipIf(!hasDatabase)("reopening a declined report", () => {
  beforeEach(emptyDatabase);

  async function declinedReport() {
    const [account] = await db()
      .insert(schema.accounts)
      .values({
        plexAccountId: "test:report",
        username: "test",
      })
      .returning();
    const [title] = await db()
      .insert(schema.media)
      .values({
        providerId: "1",
        mediaType: "tv",
        title: "Test series",
      })
      .returning();
    const [report] = await db()
      .insert(schema.reports)
      .values({
        mediaId: title.id,
        reportedBy: account.id,
        reason: "missing_season",
        seasonNumber: 2,
        status: "rejected",
        adminNote: "Unavailable",
        acknowledgedAt: new Date(),
        closedAt: new Date(),
      })
      .returning();
    await db().insert(schema.reportFollowers).values({
      reportId: report.id,
      accountId: account.id,
    });
    return report;
  }

  it("clears the refusal and previous dates and tells the follower", async () => {
    const report = await declinedReport();
    await reportDomain.updateReportStatus(report.id, "open", "Stale note");
    const [updated] = await db()
      .select()
      .from(schema.reports)
      .where(eq(schema.reports.id, report.id));
    expect(updated).toMatchObject({
      status: "open",
      adminNote: null,
      acknowledgedAt: null,
      closedAt: null,
    });
    const [notification] = await db()
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.subjectId, report.id));
    expect(notification.payload).toMatchObject({
      status: "open",
      reason: "missing_season",
    });
    expect(notification.payload).not.toHaveProperty("note");
  });

  it("keeps the refusal intact when a newer identical ask is open", async () => {
    const report = await declinedReport();
    await db().insert(schema.reports).values({
      mediaId: report.mediaId,
      reason: report.reason,
      seasonNumber: 2,
    });
    await expect(
      reportDomain.updateReportStatus(report.id, "open"),
    ).rejects.toThrow(/reportReopenTaken/);
    const [unchanged] = await db()
      .select()
      .from(schema.reports)
      .where(eq(schema.reports.id, report.id));
    expect(unchanged).toMatchObject({
      status: "rejected",
      adminNote: "Unavailable",
    });
    expect(await db().select().from(schema.notifications)).toHaveLength(0);
  });
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
  });

  it("leaves arriving to the sync, and never hands it back", async () => {
    const { requestId } = await openRequest();
    await requests.updateRequestStatus(requestId, "accepted");

    // Nobody declares a title on the server: only the index can.
    await expect(
      requests.updateRequestStatus(requestId, "available"),
    ).rejects.toThrow(/illegalTransition/);

    await db().insert(schema.libraryItems).values({
      ratingKey: "plex:1",
      kind: "movie",
      title: "Alien",
      tmdbId: "1",
    });
    expect(await requests.closeRequestsPresentInLibrary()).toBe(1);

    await expect(
      requests.updateRequestStatus(requestId, "requested"),
    ).rejects.toThrow(/illegalTransition/);
  });

  /*
   * A title fetched, watched by nobody, and deleted to free space. The request
   * that brought it has to let go of the title, or asking for it again would
   * join a request that is over, and the staff would never see the ask.
   */
  it("frees a title deleted from the server, and marks who asks again", async () => {
    const { requestId, accountId } = await openRequest();
    await requests.updateRequestStatus(requestId, "accepted");
    await db().insert(schema.libraryItems).values({
      ratingKey: "plex:1",
      kind: "movie",
      title: "Alien",
      tmdbId: "1",
    });
    await requests.closeRequestsPresentInLibrary();

    // Still there: nothing to retire.
    expect(await requests.retireRequestsGoneFromLibrary()).toBe(0);

    await db().delete(schema.libraryItems);
    expect(await requests.retireRequestsGoneFromLibrary()).toBe(1);
    expect(await requests.retireRequestsGoneFromLibrary()).toBe(0);
    await expect(
      requests.updateRequestStatus(requestId, "requested"),
    ).rejects.toThrow(/illegalTransition/);

    // Asking again opens a new request rather than joining the old one.
    const { tmdbProvider } = await import("@/lib/providers/tmdb");
    vi.spyOn(tmdbProvider, "details").mockResolvedValue({
      provider: "tmdb",
      providerId: "1",
      kind: "movie",
      title: "Alien",
      originalTitle: "Alien",
      overview: null,
      releaseDate: null,
      posterPath: null,
    } as never);
    const [other] = await db()
      .insert(schema.accounts)
      .values({ plexAccountId: "test:2", username: "other" })
      .returning({ id: schema.accounts.id });

    const byOther = await requests.createRequest("movie", "1", other.id);
    expect(byOther).toMatchObject({ joined: false, status: "requested" });

    let [fresh] = await requests.listRequests(["requested"]);
    expect(fresh.reasked).toBe(false);
    expect(fresh.removedAt).toBeInstanceOf(Date);

    // The member it was fetched for joins: now it is asked again.
    await requests.createRequest("movie", "1", accountId);
    [fresh] = await requests.listRequests(["requested"]);
    expect(fresh.reasked).toBe(true);

    const [old] = await requests.listRequests(["removed"]);
    expect(old.id).toBe(requestId);
    expect(old.removedAt).toBeNull();
    vi.restoreAllMocks();
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

/*
 * The home figures went down when the owner's Plex password changed: the
 * sync came back, touched rows, swept others, and the figures lost what had
 * happened. What arrived stays arrived, whatever the server does next.
 */
describe.skipIf(!hasDatabase)("counting the last 30 days", () => {
  beforeEach(emptyDatabase);

  it("keeps what arrived through a sweep and a resync", async () => {
    const { plexLibrary } = await import("@/lib/providers/plex");
    const library = await import("@/lib/domain/library");
    const analytics = await import("@/lib/domain/analytics");

    const now = new Date();
    const film = {
      ratingKey: "10",
      kind: "movie" as const,
      title: "Alien",
      year: 1979,
      tmdbId: "1",
      tvdbId: null,
      imdbId: null,
      parentRatingKey: null,
      grandparentRatingKey: null,
      grandparentTitle: null,
      seasonNumber: null,
      episodeNumber: null,
      addedAt: now,
      sectionKey: "1",
    };
    const other = { ...film, ratingKey: "11", title: "Aliens", tmdbId: "2" };

    vi.spyOn(plexLibrary, "sections").mockResolvedValue([
      { key: "1", title: "Films", kind: "movie" },
    ]);
    const items = vi
      .spyOn(plexLibrary, "sectionItems")
      .mockResolvedValue([film, other]);

    const [account] = await db()
      .insert(schema.accounts)
      .values({ plexAccountId: "test:week", username: "week" })
      .returning({ id: schema.accounts.id });
    const [title] = await db()
      .insert(schema.media)
      .values({ providerId: "1", mediaType: "movie", title: "Alien" })
      .returning({ id: schema.media.id });
    await db()
      .insert(schema.mediaRequests)
      .values({ mediaId: title.id, requestedBy: account.id });

    await library.syncLibrary();
    await requests.closeRequestsPresentInLibrary();
    expect(await analytics.monthlyStats()).toMatchObject({
      newContent: 2,
      requestsHandled: 1,
    });

    // The requested film is deleted from the server, then everything resyncs.
    items.mockResolvedValue([other]);
    await library.syncLibrary();
    await requests.retireRequestsGoneFromLibrary();
    await library.syncLibrary();
    await requests.closeRequestsPresentInLibrary();

    expect(await analytics.monthlyStats()).toMatchObject({
      newContent: 2,
      requestsHandled: 1,
    });
    vi.restoreAllMocks();
  });
});

/**
 * What closes an ask, and what nothing closes.
 *
 * Every ask shares one table and one lifecycle, and the administration is only
 * offered the manual close where no job can reach the row. Get that pairing
 * wrong in either direction and an ask is either settled by a hand that could
 * not see, or stuck open for good. Both happened: an ask over a whole season
 * carries no episode number, so the rule reading the index never matched it and
 * the button was withheld all the same.
 */
describe.skipIf(!hasDatabase)("settling an ask", () => {
  beforeEach(emptyDatabase);

  /** A tracked series with one season of two episodes, both aired. */
  async function trackedSeries(options: { available: boolean }) {
    const [title] = await db()
      .insert(schema.media)
      .values({ providerId: "42", mediaType: "tv", title: "Test series" })
      .returning({ id: schema.media.id });
    const [tracked] = await db()
      .insert(schema.trackedSeries)
      .values({ mediaId: title.id, lastSyncedAt: new Date() })
      .returning({ id: schema.trackedSeries.id });
    await db()
      .insert(schema.episodes)
      .values(
        [1, 2].map((episodeNumber) => ({
          seriesId: tracked.id,
          seasonNumber: 1,
          episodeNumber,
          airDate: "2020-01-01",
          plexAvailable: options.available,
          status: options.available
            ? ("available" as const)
            : ("aired_missing" as const),
        })),
      );
    return { mediaId: title.id, seriesId: tracked.id };
  }

  async function ask(
    mediaId: string,
    reason: "missing_episode" | "missing_season" | "series_outdated",
    place: { seasonNumber?: number | null; episodeNumber?: number | null } = {},
  ) {
    const [report] = await db()
      .insert(schema.reports)
      .values({
        mediaId,
        reason,
        seasonNumber: place.seasonNumber ?? null,
        episodeNumber: place.episodeNumber ?? null,
        status: "acknowledged",
        acknowledgedAt: new Date(),
      })
      .returning({ id: schema.reports.id });
    return report.id;
  }

  async function statusOf(reportId: string) {
    const [row] = await db()
      .select({ status: schema.reports.status })
      .from(schema.reports)
      .where(eq(schema.reports.id, reportId));
    return row.status;
  }

  it("closes the rest of a season once the calendar says nothing is late", async () => {
    const short = await trackedSeries({ available: false });
    const reportId = await ask(short.mediaId, "missing_episode", {
      seasonNumber: 1,
    });

    // Still short: the ask stands, and so does the refusal to close it by hand.
    expect(await reportDomain.closeReportsSolvedByCalendar()).toBe(0);
    await expect(
      reportDomain.updateReportStatus(reportId, "resolved"),
    ).rejects.toThrow(/illegalTransition/);

    await db()
      .update(schema.episodes)
      .set({ plexAvailable: true, status: "available" })
      .where(eq(schema.episodes.seriesId, short.seriesId));

    expect(await reportDomain.closeReportsSolvedByCalendar()).toBe(1);
    expect(await statusOf(reportId)).toBe("resolved");
  });

  it("closes a series ask that named no season", async () => {
    const whole = await trackedSeries({ available: true });
    const outdated = await ask(whole.mediaId, "series_outdated");
    const nameless = await ask(whole.mediaId, "missing_season");

    expect(await reportDomain.closeReportsSolvedByCalendar()).toBe(2);
    expect(await statusOf(outdated)).toBe("resolved");
    expect(await statusOf(nameless)).toBe("resolved");
  });

  /*
   * A re-cut is filed under the provider id of the series it was cut from, and
   * no provider lists a fan edit: there is no way to know how many episodes a
   * Kai or a Yabai is supposed to have. So it is never tracked, no job can ever
   * answer for it, and the close has to be the staff's.
   */
  it("hands a re-cut's ask back to the staff, since nothing can count it", async () => {
    const [title] = await db()
      .insert(schema.media)
      .values({ providerId: "77", mediaType: "tv", title: "Naruto" })
      .returning({ id: schema.media.id });
    await db().insert(schema.libraryItems).values({
      ratingKey: "plex:cut",
      kind: "show",
      title: "Naruto Kai",
      cutProviderId: "77",
    });
    // Neither a season nor an episode: the shape the route forces on a re-cut.
    const reportId = await ask(title.id, "missing_episode");

    expect(await reportDomain.closeReportsSolvedByLibrary()).toBe(0);
    expect(await reportDomain.closeReportsSolvedByCalendar()).toBe(0);

    const closed = await reportDomain.updateReportStatus(
      reportId,
      "resolved",
      "fetched by hand",
    );
    expect(closed.status).toBe("resolved");
  });

  it("closes one named episode from the index, and never through a re-cut", async () => {
    const [title] = await db()
      .insert(schema.media)
      .values({ providerId: "99", mediaType: "tv", title: "Black Clover" })
      .returning({ id: schema.media.id });
    const reportId = await ask(title.id, "missing_episode", {
      seasonNumber: 1,
      episodeNumber: 3,
    });

    /*
     * The show the server matched to the wrong series: it holds the re-cut,
     * files it under someone else's id, and Umbra worked the real one out into
     * `cut_provider_id`. Its episode three is not this series' episode three.
     */
    await db().insert(schema.libraryItems).values({
      ratingKey: "plex:wrong",
      kind: "show",
      title: "Black Clover Kai",
      tmdbId: "99",
      cutProviderId: "1234",
    });
    await db().insert(schema.libraryItems).values({
      ratingKey: "plex:wrong:e3",
      kind: "episode",
      title: "Episode 3",
      grandparentRatingKey: "plex:wrong",
      seasonNumber: 1,
      episodeNumber: 3,
    });
    expect(await reportDomain.closeReportsSolvedByLibrary()).toBe(0);

    // The series itself, as the server files it when it gets it right.
    await db().insert(schema.libraryItems).values({
      ratingKey: "plex:right",
      kind: "show",
      title: "Black Clover",
      tmdbId: "99",
    });
    await db().insert(schema.libraryItems).values({
      ratingKey: "plex:right:e3",
      kind: "episode",
      title: "Episode 3",
      grandparentRatingKey: "plex:right",
      seasonNumber: 1,
      episodeNumber: 3,
    });
    expect(await reportDomain.closeReportsSolvedByLibrary()).toBe(1);
    expect(await statusOf(reportId)).toBe("resolved");
  });
});

/**
 * A re-cut reads available, and nothing counts it.
 *
 * "Kai", "Yabai" and the like drop the filler and renumber what is left. The
 * media server files one under the original series, which is how a hundred
 * episodes came to be read against a thousand and the title stayed forever
 * short. The answer is not a better count, because there is no count to be had:
 * no provider lists a fan edit. So a re-cut is on the server, whole, and it
 * carries no ladder for anything to be missing from.
 *
 * The two halves of that live in SQL, which is why they are asserted here: what
 * the index answers for the id a re-cut is reachable by, and what the season
 * reads refuse to count.
 */
describe.skipIf(!hasDatabase)("a re-cut on the server", () => {
  beforeEach(emptyDatabase);

  /** "Naruto Kai", which the media server matched to nothing at all. */
  async function unmatchedCut() {
    await db().insert(schema.libraryItems).values({
      ratingKey: "plex:kai",
      kind: "show",
      title: "Naruto Kai",
      cutProviderId: "77",
    });
    await db()
      .insert(schema.libraryItems)
      .values(
        [1, 2, 3].map((episodeNumber) => ({
          ratingKey: `plex:kai:e${episodeNumber}`,
          kind: "episode" as const,
          title: `Episode ${episodeNumber}`,
          grandparentRatingKey: "plex:kai",
          seasonNumber: 1,
          episodeNumber,
        })),
      );
  }

  it("is on the server under the id Umbra worked out for it", async () => {
    await unmatchedCut();
    // No provider id from the server at all, so every rule about presence used
    // to walk straight past it and the search offered to request the series.
    expect(await catalog.isInLibrary("tv", "77")).toBe(true);
  });

  it("builds no ladder, for itself or for anyone else", async () => {
    await unmatchedCut();

    // Its own page states the cut instead of drawing seasons, and there is
    // nothing here for one to be drawn from.
    expect(await library.seasonsOnServer("77")).toEqual([]);
    expect([...(await library.episodeCountsBySeason("77"))]).toEqual([]);
    expect(await library.episodesOnServer("77", 1)).toEqual([]);
  });

  it("never fills the ladder of the series it was mistaken for", async () => {
    // The other case: the agent read a name it did not know and picked the
    // closest thing in its catalogue, so the row carries someone else's id.
    await db().insert(schema.libraryItems).values({
      ratingKey: "plex:mismatched",
      kind: "show",
      title: "Black Clover Kai",
      tmdbId: "99",
      cutProviderId: "1234",
    });
    await db().insert(schema.libraryItems).values({
      ratingKey: "plex:mismatched:e1",
      kind: "episode",
      title: "Episode 1",
      grandparentRatingKey: "plex:mismatched",
      seasonNumber: 1,
      episodeNumber: 1,
    });

    // The series the server named is not here: its page must not count this
    // edit's episodes as its own, nor read as partly present because of them.
    expect(await library.seasonsOnServer("99")).toEqual([]);
    expect([...(await library.episodeCountsBySeason("99"))]).toEqual([]);
    expect(await catalog.isInLibrary("tv", "99")).toBe(false);

    // And it answers for the series it really is a cut of.
    expect(await catalog.isInLibrary("tv", "1234")).toBe(true);
  });

  /**
   * What a search result says about it, which is the sentence a member reads.
   *
   * `decorate` is what every list goes through, and the cut is read from the
   * name the server files the show under against the names the provider gives
   * it: both are already in hand, so nothing is asked of the gateway here.
   */
  it("reads available rather than partly here", async () => {
    await unmatchedCut();
    const [result] = await catalog.decorate([
      {
        provider: "tmdb",
        providerId: "77",
        kind: "tv",
        title: "Naruto",
        originalTitle: "NARUTO",
        overview: null,
        releaseDate: "2002-10-03",
        posterPath: null,
        backdropPath: null,
        popularity: 1,
        genreIds: [],
        voteAverage: null,
        voteCount: 0,
      },
    ]);

    expect(result.alternateCut).toBe("kai");
    // Not "partial": the shortfall a thousand broadcasts would show against a
    // hundred files is the edit, not something anyone can fetch.
    expect(result.availability).toBe("available");
  });

  it("gives way to the series itself when the server holds both", async () => {
    await unmatchedCut();
    await db().insert(schema.libraryItems).values({
      ratingKey: "plex:naruto",
      kind: "show",
      title: "Naruto",
      tmdbId: "77",
    });
    await db().insert(schema.libraryItems).values({
      ratingKey: "plex:naruto:e1",
      kind: "episode",
      title: "Episode 1",
      grandparentRatingKey: "plex:naruto",
      seasonNumber: 1,
      episodeNumber: 1,
    });

    // The ladder is the series', and it counts the series' episode alone: the
    // three the edit keeps are a different numbering.
    expect(await library.seasonsOnServer("77")).toEqual([1]);
    expect([...(await library.episodeCountsBySeason("77"))]).toEqual([[1, 1]]);
  });
});
