import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  ACADEMY_VIDEO_BASE_URL,
  ACADEMY_VIDEO_MANIFEST,
  academyAssetUrl,
  academyVideo,
  formatVideoDuration,
} from "../src/lib/academy/videos.ts";

describe("academyVideo", () => {
  it("answers an unpublished lesson with the all-null shape", () => {
    deepStrictEqual(academyVideo("first-agent"), {
      id: "first-agent",
      src: null,
      posterSrc: null,
      durationSeconds: null,
    });
  });

  it("echoes the id it was asked about, whatever it was", () => {
    strictEqual(academyVideo("").id, "");
    strictEqual(academyVideo("does-not-exist").id, "does-not-exist");
  });

  it("does not resolve prototype keys as if they were lessons", () => {
    // `MANIFEST["toString"]` is a function; a lesson id must never reach it.
    for (const id of ["toString", "constructor", "__proto__", "hasOwnProperty"])
      strictEqual(academyVideo(id).src, null, id);
  });

  it("resolves every published row against the base URL", () => {
    // Vacuous while nothing is published, and the guard that catches a bad row
    // the day the founder's recordings land in the manifest.
    for (const [id, asset] of Object.entries(ACADEMY_VIDEO_MANIFEST)) {
      const video = academyVideo(id);
      strictEqual(video.src, academyAssetUrl(asset.src), id);
      ok(video.src?.startsWith(ACADEMY_VIDEO_BASE_URL), id);
      strictEqual(
        video.posterSrc,
        asset.posterSrc === null ? null : academyAssetUrl(asset.posterSrc),
        id,
      );
      strictEqual(video.durationSeconds, asset.durationSeconds, id);
      ok(
        Number.isFinite(asset.durationSeconds) && asset.durationSeconds > 0,
        id,
      );
    }
  });
});

describe("academyAssetUrl", () => {
  it("joins a file name onto the CDN directory", () => {
    strictEqual(
      academyAssetUrl("first-agent.mp4"),
      `${ACADEMY_VIDEO_BASE_URL}first-agent.mp4`,
    );
    strictEqual(
      academyAssetUrl("chapter-1/intro.mp4"),
      `${ACADEMY_VIDEO_BASE_URL}chapter-1/intro.mp4`,
    );
  });

  it("keeps the base URL a directory, never swallowing its last segment", () => {
    ok(ACADEMY_VIDEO_BASE_URL.endsWith("/"));
    ok(academyAssetUrl("x.mp4").includes("/academy/videos/x.mp4"));
  });

  it("lets an absolute row win, so one asset can live elsewhere", () => {
    strictEqual(
      academyAssetUrl("https://cdn.example.com/intro.mp4"),
      "https://cdn.example.com/intro.mp4",
    );
  });
});

describe("formatVideoDuration", () => {
  it("reads as a player's clock", () => {
    strictEqual(formatVideoDuration(0), "0:00");
    strictEqual(formatVideoDuration(5), "0:05");
    strictEqual(formatVideoDuration(59), "0:59");
    strictEqual(formatVideoDuration(60), "1:00");
    strictEqual(formatVideoDuration(65), "1:05");
    strictEqual(formatVideoDuration(119), "1:59");
  });

  it("floors partial seconds instead of rounding up past the end", () => {
    strictEqual(formatVideoDuration(65.9), "1:05");
    strictEqual(formatVideoDuration(0.4), "0:00");
  });

  it("keeps counting in minutes past an hour", () => {
    strictEqual(formatVideoDuration(3600), "60:00");
    strictEqual(formatVideoDuration(3661), "61:01");
  });

  it("never prints NaN or a negative clock", () => {
    strictEqual(formatVideoDuration(-1), "0:00");
    strictEqual(formatVideoDuration(Number.NaN), "0:00");
    strictEqual(formatVideoDuration(Number.POSITIVE_INFINITY), "0:00");
  });
});
