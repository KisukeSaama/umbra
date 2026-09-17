import { describe, expect, it } from "vitest";

import { REPORT_REASONS, REPORT_STATUSES } from "@/lib/db/schema";
import {
  ASK_REASONS,
  askKey,
  canTransition,
  isAsk,
  isAutoClosable,
  isCutReasonAllowed,
  isLive,
  isReasonAllowed,
  isSettled,
  isSettledByJob,
  nextStatuses,
  NOTHING_SETTLED,
  reasonKey,
  reasonsFor,
  reasonsForCut,
  REPORT_TARGETS,
  targetOf,
} from "@/lib/reports/reasons";

/**
 * A report is entirely made of choices, so the rules that decide which choices
 * exist are the feature. These are the ones that would go wrong quietly.
 */

/** A season of a series under watch: the ordinary case the moves assume. */
const season = {
  seasonNumber: 2,
  episodeNumber: null,
  hasCalendar: true,
} as const;
/** One episode of it. */
const episode = { ...season, episodeNumber: 5 } as const;
/** The series itself. */
const series = {
  seasonNumber: null,
  episodeNumber: null,
  hasCalendar: true,
} as const;
/** A re-cut: no season to point at, and no calendar anywhere to count it. */
const cut = {
  seasonNumber: null,
  episodeNumber: null,
  hasCalendar: false,
} as const;

describe("reason wording", () => {
  it("speaks of episodes in the plural when no episode is pointed at", () => {
    expect(reasonKey({ reason: "missing_episode", episodeNumber: null })).toBe(
      "report.reason.missing_episodes",
    );
    expect(reasonKey({ reason: "missing_episode", episodeNumber: 3 })).toBe(
      "report.reason.missing_episode",
    );
    expect(reasonKey({ reason: "missing_season", episodeNumber: null })).toBe(
      "report.reason.missing_season",
    );
  });
});

describe("report targets", () => {
  it("reads the target from what the member actually picked", () => {
    expect(targetOf("movie", null, null)).toBe("movie");
    expect(targetOf("tv", null, null)).toBe("series");
    expect(targetOf("tv", 2, null)).toBe("season");
    expect(targetOf("tv", 2, 5)).toBe("episode");
  });

  it("never offers a reason that cannot apply where it points", () => {
    // A film has no seasons, and an episode cannot be the thing that is behind.
    expect(reasonsFor("movie")).not.toContain("missing_season");
    expect(reasonsFor("movie")).not.toContain("series_outdated");
    expect(reasonsFor("episode")).not.toContain("series_outdated");
    expect(reasonsFor("series")).toContain("series_outdated");
  });

  it("only knows reasons the database will accept", () => {
    for (const target of REPORT_TARGETS)
      for (const reason of reasonsFor(target))
        expect(REPORT_REASONS).toContain(reason);
  });

  it("gives every target something to say", () => {
    for (const target of REPORT_TARGETS)
      expect(reasonsFor(target).length).toBeGreaterThan(0);
  });

  it("rejects a reason that does not belong to the target", () => {
    // The route trusts this, so a crafted body cannot record "a season is
    // missing" against a film.
    expect(isReasonAllowed("movie", "missing_season")).toBe(false);
    expect(isReasonAllowed("series", "missing_season")).toBe(true);
  });
});

describe("report lifecycle", () => {
  it("matches the live statuses the partial unique index uses", () => {
    // If these ever drift, a closed report would start blocking a new one, or
    // duplicates would slip past the index.
    const live = REPORT_STATUSES.filter((status) => isLive(status));
    expect(live).toEqual(["open", "acknowledged", "in_progress"]);
  });

  it("keeps resolved reports closed and refuses skipped steps", () => {
    expect(canTransition("open", "acknowledged", "bad_quality", episode)).toBe(
      true,
    );
    expect(canTransition("open", "resolved", "bad_quality", episode)).toBe(
      false,
    );
    expect(
      canTransition("acknowledged", "resolved", "bad_quality", episode),
    ).toBe(true);
    expect(canTransition("resolved", "open", "bad_quality", episode)).toBe(
      false,
    );
    expect(nextStatuses("duplicate", "bad_quality", episode)).toHaveLength(0);
  });

  it("reopens declined asks and faults into the waiting queue", () => {
    for (const reason of REPORT_REASONS) {
      expect(nextStatuses("rejected", reason, season)).toEqual(["open"]);
      expect(canTransition("rejected", "acknowledged", reason, season)).toBe(
        false,
      );
    }
  });

  it("works a fault on, but takes an ask straight to settled", () => {
    expect(nextStatuses("acknowledged", "bad_quality", season)).toContain(
      "in_progress",
    );
    expect(
      nextStatuses("acknowledged", "missing_season", season),
    ).not.toContain("in_progress");
    expect(nextStatuses("acknowledged", "missing_season", season)).toContain(
      "rejected",
    );
  });

  it("leaves settling to the sync wherever the sync can see it", () => {
    for (const [reason, place] of [
      ["missing_episode", episode],
      ["missing_season", season],
      ["series_outdated", series],
    ] as const)
      for (const status of REPORT_STATUSES)
        expect(canTransition(status, "resolved", reason, place)).toBe(false);
    expect(
      canTransition("acknowledged", "resolved", "bad_quality", episode),
    ).toBe(true);
  });

  /*
   * The hole this closes: an ask over a whole season carries no episode
   * number, so the rule that reads the index could never match it, and the
   * button was withheld all the same. It could only ever leave the queue as
   * refused.
   */
  it("hands back the close wherever no job can reach the row", () => {
    // The rest of a season, on a series under watch: the calendar answers.
    expect(isSettledByJob("missing_episode", season)).toBe(true);
    expect(
      canTransition("acknowledged", "resolved", "missing_episode", season),
    ).toBe(false);

    // The same ask on a series nobody put under watch: nothing counts it.
    const untracked = { ...season, hasCalendar: false };
    expect(isSettledByJob("missing_episode", untracked)).toBe(false);
    expect(
      canTransition("acknowledged", "resolved", "missing_episode", untracked),
    ).toBe(true);

    // A re-cut, which is the only shape with neither a season nor an episode:
    // no provider lists a fan edit, so nothing knows how many episodes it has.
    for (const reason of reasonsForCut()) {
      expect(isSettledByJob(reason, cut)).toBe(false);
      expect(canTransition("acknowledged", "resolved", reason, cut)).toBe(true);
    }
  });

  it("proposes nothing that is not a real status", () => {
    for (const reason of ["bad_quality", "missing_season"] as const)
      for (const status of REPORT_STATUSES)
        for (const next of nextStatuses(status, reason, season))
          expect(REPORT_STATUSES).toContain(next);
  });

  it("only lets the sync close what the sync can actually see", () => {
    // Umbra indexes titles and episodes, not codecs, tracks or playback. A job
    // that closed those would have to walk media parts on the server, which is
    // exactly what this project refuses to do.
    expect(isAutoClosable("missing_episode")).toBe(true);
    expect(isAutoClosable("missing_season")).toBe(true);
    expect(isAutoClosable("series_outdated")).toBe(true);
    expect(isAutoClosable("bad_quality")).toBe(false);
    expect(isAutoClosable("missing_subtitles")).toBe(false);
    expect(isAutoClosable("playback_error")).toBe(false);
    expect(isAutoClosable("wrong_content")).toBe(false);
  });
});

describe("ask keys", () => {
  it("tells the series apart from its seasons", () => {
    // The page reads these to know an ask is already open. A series and a
    // season colliding here would hide the button that has never been pressed.
    expect(askKey({ seasonNumber: null, reason: "series_outdated" })).not.toBe(
      askKey({ seasonNumber: 1, reason: "series_outdated" }),
    );
    expect(askKey({ seasonNumber: 1, reason: "missing_season" })).not.toBe(
      askKey({ seasonNumber: 1, reason: "missing_episode" }),
    );
    expect(askKey({ seasonNumber: 2, reason: "missing_episode" })).toBe(
      askKey({ seasonNumber: 2, reason: "missing_episode" }),
    );
  });
});

describe("asks against faults", () => {
  it("counts what is missing as an ask, not as a report", () => {
    // The gesture behind these is "ask for this season", and the follow-up
    // page lists them among the requests. Calling one a report there is the
    // bug this exists to prevent.
    expect(isAsk("missing_season")).toBe(true);
    expect(isAsk("missing_episode")).toBe(true);
    expect(isAsk("series_outdated")).toBe(true);
  });

  it("leaves everything about a title that is here as a fault", () => {
    expect(isAsk("bad_quality")).toBe(false);
    expect(isAsk("missing_audio_track")).toBe(false);
    expect(isAsk("missing_subtitles")).toBe(false);
    expect(isAsk("playback_error")).toBe(false);
    expect(isAsk("wrong_content")).toBe(false);
    expect(isAsk("wrong_order")).toBe(false);
    expect(isAsk("duplicate_entry")).toBe(false);
  });

  it("splits the reasons the database knows in two, with nothing left over", () => {
    const asks = REPORT_REASONS.filter(isAsk);
    const faults = REPORT_REASONS.filter((reason) => !isAsk(reason));
    expect(asks.length + faults.length).toBe(REPORT_REASONS.length);
    expect([...asks].sort()).toEqual([...ASK_REASONS].sort());
  });
});

describe("asks the administration has just answered", () => {
  it("settles nothing until something has been answered", () => {
    expect(isSettled(NOTHING_SETTLED, null)).toBe(false);
    expect(isSettled(NOTHING_SETTLED, 3)).toBe(false);
  });

  it("settles the season that was answered, and only that one", () => {
    const settled = { series: false, seasons: [2] };
    expect(isSettled(settled, 2)).toBe(true);
    expect(isSettled(settled, 3)).toBe(false);
    // The series as a whole is still short: one season answered says nothing
    // about the rest of the ladder.
    expect(isSettled(settled, null)).toBe(false);
  });

  it("lets a series answered whole cover every season under it", () => {
    const settled = { series: true, seasons: [] };
    expect(isSettled(settled, null)).toBe(true);
    expect(isSettled(settled, 1)).toBe(true);
    expect(isSettled(settled, 12)).toBe(true);
  });
});

describe("re-cut reasons", () => {
  it("keeps only what asks for the rest", () => {
    expect(reasonsForCut()).toEqual(["missing_episode", "series_outdated"]);
    expect(reasonsForCut().every(isAsk)).toBe(true);
  });

  it("turns down what nobody on this side can put right", () => {
    for (const reason of [
      "bad_quality",
      "missing_audio_track",
      "missing_subtitles",
      "playback_error",
      "wrong_order",
      "wrong_content",
      "duplicate_entry",
    ] as const)
      expect(isCutReasonAllowed(reason)).toBe(false);
  });

  /*
   * A re-cut is the one place where the reasons a sync usually settles cannot
   * be settled by one: there is no way to know how many episodes a Kai or a
   * Yabai has. So they keep the manual close, and the queue is not left with
   * rows the administration can only refuse.
   */
  it("keeps the asks it allows, and hands their closing back to the staff", () => {
    for (const reason of reasonsForCut()) {
      expect(isAsk(reason)).toBe(true);
      expect(isAutoClosable(reason)).toBe(true);
      expect(isSettledByJob(reason, cut)).toBe(false);
    }
  });
});
