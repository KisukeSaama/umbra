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
  nextStatuses,
  NOTHING_SETTLED,
  reasonsFor,
  reasonsForCut,
  REPORT_TARGETS,
  targetOf,
} from "@/lib/reports/reasons";

/**
 * A report is entirely made of choices, so the rules that decide which choices
 * exist are the feature. These are the ones that would go wrong quietly.
 */

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

  it("only moves forward, and never out of a settled state", () => {
    expect(canTransition("open", "acknowledged", "bad_quality")).toBe(true);
    expect(canTransition("open", "resolved", "bad_quality")).toBe(false);
    expect(canTransition("acknowledged", "resolved", "bad_quality")).toBe(true);
    expect(canTransition("resolved", "open", "bad_quality")).toBe(false);
    expect(nextStatuses("rejected", "bad_quality")).toHaveLength(0);
  });

  it("works a fault on, but takes an ask straight to settled", () => {
    expect(nextStatuses("acknowledged", "bad_quality")).toContain(
      "in_progress",
    );
    expect(nextStatuses("acknowledged", "missing_season")).not.toContain(
      "in_progress",
    );
    expect(canTransition("acknowledged", "resolved", "missing_season")).toBe(
      true,
    );
  });

  it("proposes nothing that is not a real status", () => {
    for (const reason of ["bad_quality", "missing_season"] as const)
      for (const status of REPORT_STATUSES)
        for (const next of nextStatuses(status, reason))
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

  it("lets every reason it keeps close itself on the next scan", () => {
    expect(reasonsForCut().every(isAutoClosable)).toBe(true);
  });
});
