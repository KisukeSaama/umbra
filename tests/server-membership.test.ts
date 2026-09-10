import { describe, expect, it } from "vitest";

import { listsServer, sharedIdsFrom } from "@/lib/providers/plex-tv";

const SERVER = "941dd1285495d0b73a8268ac13bb333e883e2225";

describe("server membership", () => {
  it("recognises the server in a plain resource list", () => {
    const body = [
      { clientIdentifier: "other-server", provides: "server" },
      { clientIdentifier: SERVER, provides: "server", owned: false },
    ];
    expect(listsServer(body, SERVER)).toBe(true);
  });

  it("refuses a list the server is absent from", () => {
    const body = [{ clientIdentifier: "other-server", provides: "server" }];
    expect(listsServer(body, SERVER)).toBe(false);
  });

  it("reads a list converted from XML", () => {
    const body = {
      MediaContainer: {
        Device: { "@clientIdentifier": SERVER, "@provides": "server" },
      },
    };
    expect(listsServer(body, SERVER)).toBe(true);
  });

  it("ignores a player that happens to carry the same identifier", () => {
    const body = [{ clientIdentifier: SERVER, provides: "player,controller" }];
    expect(listsServer(body, SERVER)).toBe(false);
  });

  it("refuses an empty or unreadable answer", () => {
    expect(listsServer(null, SERVER)).toBe(false);
    expect(listsServer([], SERVER)).toBe(false);
    expect(listsServer("nope", SERVER)).toBe(false);
  });
});

describe("share list", () => {
  it("reads one id per shared server", () => {
    const body = {
      MediaContainer: {
        SharedServer: [
          { id: "1", userID: 10615081, username: "alegzandr" },
          { id: "2", userID: 25951258, username: "david1481" },
        ],
      },
    };
    expect([...sharedIdsFrom(body)]).toEqual(["10615081", "25951258"]);
  });

  it("reads a lone share left outside an array", () => {
    const body = {
      MediaContainer: { SharedServer: { "@userID": "60217947" } },
    };
    expect(sharedIdsFrom(body)).toEqual(["60217947"]);
  });

  it("answers nothing for an empty or unreadable list", () => {
    expect(sharedIdsFrom({ MediaContainer: { size: 0 } })).toEqual([]);
    expect(sharedIdsFrom(null)).toEqual([]);
  });
});
