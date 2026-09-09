import {
  mkdir,
  mkdtemp,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  deleteStorageEntries,
  isSafeName,
  listStorageDirectory,
  openStorageVideo,
  RangeNotSatisfiableError,
  videoType,
  weighStorageEntries,
} from "@/lib/domain/storage-files";
import { AppError } from "@/lib/errors";

/**
 * The frontier, exercised on a real directory.
 *
 * Everything here runs against a temporary tree: two volumes, one of which
 * may hold a link out to the other, so that the checks on names, roots and
 * links are asserted against the file system rather than against a mock.
 */

let base: string;
let volumes: { label: string; path: string }[];

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), "umbra-storage-"));
  const media = join(base, "media");
  const other = join(base, "other");
  await mkdir(join(media, "Movies", "Alien (1979)"), { recursive: true });
  await mkdir(join(media, "Series"), { recursive: true });
  await mkdir(join(media, "lost+found"), { recursive: true });
  await mkdir(join(media, "data"), { recursive: true });
  await mkdir(join(media, "Series", "data"), { recursive: true });
  await mkdir(other, { recursive: true });
  await writeFile(join(media, "Movies", "Alien (1979)", "Alien.mkv"), "abcdef");
  await writeFile(join(media, "Movies", "Alien (1979)", "Alien.srt"), "sub");
  await writeFile(join(media, "Movies", "readme.txt"), "hello");
  await writeFile(join(other, "secret.txt"), "nope");
  volumes = [
    { label: "Media", path: media },
    { label: "Other", path: other },
  ];
});

afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

async function code(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "ok";
  } catch (error) {
    if (error instanceof AppError) return error.messageKey;
    throw error;
  }
}

describe("names", () => {
  it("accepts a plain name and refuses everything else", () => {
    expect(isSafeName("Alien (1979)")).toBe(true);
    expect(isSafeName("..")).toBe(false);
    expect(isSafeName(".")).toBe(false);
    expect(isSafeName("")).toBe(false);
    expect(isSafeName("a/b")).toBe(false);
    expect(isSafeName("a\\b")).toBe(false);
    expect(isSafeName("a\0b")).toBe(false);
    expect(isSafeName("x".repeat(256))).toBe(false);
  });

  it("knows a video from its extension", () => {
    expect(videoType("Alien.MKV")).toBe("video/x-matroska");
    expect(videoType("Alien.mp4")).toBe("video/mp4");
    expect(videoType("Alien.srt")).toBeNull();
  });
});

describe("listing", () => {
  it("lists a directory, folders first", async () => {
    const listing = await listStorageDirectory("Media", ["Movies"], volumes);
    expect(listing.entries.map((entry) => entry.name)).toEqual([
      "Alien (1979)",
      "readme.txt",
    ]);
    expect(listing.entries[0]).toMatchObject({
      kind: "directory",
      bytes: null,
    });
    expect(listing.entries[1]).toMatchObject({ kind: "file", bytes: 5 });
  });

  it("hides what is not a library at the root of a volume", async () => {
    const root = await listStorageDirectory("Media", [], volumes);
    expect(root.entries.map((entry) => entry.name)).toEqual([
      "Movies",
      "Series",
    ]);
  });

  it("leaves those names alone below the root", async () => {
    const listing = await listStorageDirectory("Media", ["Series"], volumes);
    expect(listing.entries.map((entry) => entry.name)).toContain("data");
  });

  it("marks videos as playable", async () => {
    const listing = await listStorageDirectory(
      "Media",
      ["Movies", "Alien (1979)"],
      volumes,
    );
    const byName = Object.fromEntries(
      listing.entries.map((entry) => [entry.name, entry]),
    );
    expect(byName["Alien.mkv"].playable).toBe(true);
    expect(byName["Alien.srt"].playable).toBeUndefined();
  });

  it("refuses an unknown volume and a name that climbs", async () => {
    expect(await code(listStorageDirectory("Nope", [], volumes))).toBe(
      "error.invalidPath",
    );
    expect(await code(listStorageDirectory("Media", [".."], volumes))).toBe(
      "error.invalidPath",
    );
    expect(
      await code(listStorageDirectory("Media", ["../other"], volumes)),
    ).toBe("error.invalidPath");
  });

  it("answers not found for a folder that is not there", async () => {
    expect(await code(listStorageDirectory("Media", ["Ghost"], volumes))).toBe(
      "error.pathNotFound",
    );
  });

  it("neither lists nor walks through a symbolic link", async () => {
    try {
      await symlink(join(base, "other"), join(base, "media", "escape"), "dir");
    } catch {
      // No permission to link on this machine: nothing to assert.
      return;
    }
    const listing = await listStorageDirectory("Media", [], volumes);
    expect(listing.entries.map((entry) => entry.name)).not.toContain("escape");
    expect(await code(listStorageDirectory("Media", ["escape"], volumes))).toBe(
      "error.invalidPath",
    );
  });
});

describe("weighing", () => {
  it("sums files under the selected entries", async () => {
    const weight = await weighStorageEntries(
      "Media",
      ["Movies"],
      ["Alien (1979)", "readme.txt"],
      volumes,
    );
    expect(weight).toEqual({ bytes: 6 + 3 + 5, files: 3, partial: false });
  });
});

describe("deletion", () => {
  it("deletes files and folders in one batch and reports each", async () => {
    const result = await deleteStorageEntries(
      "Media",
      ["Movies"],
      ["Alien (1979)", "readme.txt", "already-gone.txt"],
      volumes,
    );
    expect(result.deleted).toEqual([
      "Alien (1979)",
      "readme.txt",
      "already-gone.txt",
    ]);
    expect(result.failed).toEqual([]);
    expect(await readdir(join(base, "media", "Movies"))).toEqual([]);
  });

  it("never reaches outside the volume", async () => {
    expect(
      await code(deleteStorageEntries("Media", [], ["../other"], volumes)),
    ).toBe("error.invalidPath");
    expect(
      await code(deleteStorageEntries("Media", [".."], ["other"], volumes)),
    ).toBe("error.invalidPath");
    expect(await readdir(join(base, "other"))).toEqual(["secret.txt"]);
  });

  it("protects the libraries at the root of a volume", async () => {
    expect(
      await code(deleteStorageEntries("Media", [], ["Movies"], volumes)),
    ).toBe("error.deleteAtRoot");
    expect(await readdir(join(base, "media"))).toContain("Movies");
  });

  it("refuses an empty batch", async () => {
    expect(
      await code(deleteStorageEntries("Media", ["Movies"], [], volumes)),
    ).toBe("error.invalidPath");
  });
});

describe("playback", () => {
  it("serves the whole file, then a range of it", async () => {
    const whole = await openStorageVideo(
      "Media",
      ["Movies", "Alien (1979)"],
      "Alien.mkv",
      null,
      volumes,
    );
    expect(whole.status).toBe(200);
    expect(whole.headers["Content-Length"]).toBe("6");
    expect(whole.headers["Content-Type"]).toBe("video/x-matroska");
    await whole.body.cancel();

    const part = await openStorageVideo(
      "Media",
      ["Movies", "Alien (1979)"],
      "Alien.mkv",
      "bytes=2-3",
      volumes,
    );
    expect(part.status).toBe(206);
    expect(part.headers["Content-Range"]).toBe("bytes 2-3/6");
    expect(part.headers["Content-Length"]).toBe("2");
    const text = await new Response(part.body).text();
    expect(text).toBe("cd");
  });

  it("refuses a range past the end and a file that is not a video", async () => {
    await expect(
      openStorageVideo(
        "Media",
        ["Movies", "Alien (1979)"],
        "Alien.mkv",
        "bytes=10-",
        volumes,
      ),
    ).rejects.toBeInstanceOf(RangeNotSatisfiableError);
    expect(
      await code(
        openStorageVideo(
          "Media",
          ["Movies", "Alien (1979)"],
          "Alien.srt",
          null,
          volumes,
        ),
      ),
    ).toBe("error.notPlayable");
  });
});
