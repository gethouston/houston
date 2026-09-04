import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  applyDownloadEvent,
  EMPTY_DOWNLOAD_TALLY,
} from "../src/lib/update-download-progress.ts";

describe("applyDownloadEvent", () => {
  it("resets the tally on Started and reads unknown until bytes arrive", () => {
    const { tally, progress } = applyDownloadEvent(
      { total: 5, received: 5 },
      { event: "Started", data: { contentLength: 200 } },
    );
    deepStrictEqual(tally, { total: 200, received: 0 });
    strictEqual(progress, null);
  });

  it("accumulates chunks into a rounded, capped percentage", () => {
    let state = applyDownloadEvent(EMPTY_DOWNLOAD_TALLY, {
      event: "Started",
      data: { contentLength: 300 },
    });
    state = applyDownloadEvent(state.tally, {
      event: "Progress",
      data: { chunkLength: 100 },
    });
    strictEqual(state.progress, 33);
    state = applyDownloadEvent(state.tally, {
      event: "Progress",
      data: { chunkLength: 250 },
    });
    strictEqual(state.progress, 100);
  });

  it("stays unknown when the feed sent no content length", () => {
    const started = applyDownloadEvent(EMPTY_DOWNLOAD_TALLY, {
      event: "Started",
      data: {},
    });
    const { progress } = applyDownloadEvent(started.tally, {
      event: "Progress",
      data: { chunkLength: 1024 },
    });
    strictEqual(progress, null);
  });

  it("reads 100 on Finished whatever the chunks added up to", () => {
    const { progress } = applyDownloadEvent(
      { total: 100, received: 97 },
      { event: "Finished", data: {} },
    );
    strictEqual(progress, 100);
  });
});
