import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  type PasteDeps,
  pasteLanding,
  shareByPaste,
} from "../src/components/organization/org-chart-share-paste.ts";

/** A promise this test settles by hand. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const PNG = new File(["png"], "acme-org-chart.png", { type: "image/png" });
const URL_ = "https://www.linkedin.com/feed/?shareActive=true&text=Hello";

/** Deps that record every call, in a browser unless overridden. */
function harness(overrides: Partial<PasteDeps> = {}) {
  const calls: string[] = [];
  const reports: string[] = [];
  const deps: PasteDeps = {
    post: "Hello",
    png: Promise.resolve(PNG),
    copyImage: async () => {
      calls.push("copy");
    },
    open: async (url) => {
      calls.push(`open:${new URL(url).host}`);
      return true;
    },
    save: async (file) => {
      calls.push(`save:${file.name}`);
      return true;
    },
    report: (command) => reports.push(command),
    tauri: false,
    ...overrides,
  };
  return { deps, calls, reports };
}

describe("shareByPaste", () => {
  it("starts the image copy, then opens LinkedIn, in the click's own tick", async () => {
    const drawing = deferred<File>();
    const copied = deferred<void>();
    const { deps, calls } = harness({ png: drawing.promise });
    let handed: Promise<File> | null = null;
    deps.copyImage = (png) => {
      handed = png;
      calls.push("copy");
      return copied.promise;
    };
    const running = shareByPaste(deps);
    // Synchronously, before the drawing or the copy settles: both started,
    // the copy first, and the copy was handed the drawing itself.
    deepStrictEqual(calls, ["copy", "open:www.linkedin.com"]);
    strictEqual(handed, drawing.promise);
    drawing.resolve(PNG);
    copied.resolve();
    deepStrictEqual(await running, {
      channel: "linkedin",
      line: { kind: "copied" },
    });
  });

  it("saves the image instead when the clipboard refuses, without a report", async () => {
    const { deps, calls, reports } = harness({
      copyImage: () =>
        Promise.reject(new DOMException("no focus", "NotAllowedError")),
    });
    deepStrictEqual(await shareByPaste(deps), {
      channel: "linkedin_download",
      line: { kind: "saved" },
    });
    deepStrictEqual(calls, [
      "open:www.linkedin.com",
      "save:acme-org-chart.png",
    ]);
    deepStrictEqual(reports, []);
  });

  it("reports an unexpected clipboard failure, and still saves", async () => {
    const { deps, reports } = harness({
      copyImage: () => {
        throw new TypeError("boom");
      },
    });
    strictEqual((await shareByPaste(deps)).channel, "linkedin_download");
    deepStrictEqual(reports, ["org_chart_share_copy_image"]);
  });

  it("opens LinkedIn without the image when the drawing failed, reporting nothing new", async () => {
    const failed = Promise.reject(new Error("no canvas"));
    failed.catch(() => {});
    const { deps, calls, reports } = harness({
      png: failed,
      copyImage: (png) => png.then(() => {}),
    });
    deepStrictEqual(await shareByPaste(deps), {
      channel: "linkedin_text_only",
      line: null,
    });
    deepStrictEqual(calls, ["open:www.linkedin.com"]);
    deepStrictEqual(reports, []);
  });

  it("reports a failed save", async () => {
    const { deps, reports } = harness({
      copyImage: undefined,
      save: () => Promise.reject(new Error("disk full")),
    });
    strictEqual((await shareByPaste(deps)).channel, "linkedin_text_only");
    deepStrictEqual(reports, ["org_chart_share_download"]);
  });
});

describe("pasteLanding", () => {
  it("offers LinkedIn's link when a browser blocked it, tracking only its use", () => {
    deepStrictEqual(pasteLanding(URL_, false, "copied", false), {
      channel: null,
      line: {
        kind: "blocked",
        url: URL_,
        channel: "linkedin",
        image: "copied",
      },
    });
    deepStrictEqual(pasteLanding(URL_, false, null, false), {
      channel: null,
      line: { kind: "blocked", url: URL_, channel: "linkedin_text_only" },
    });
  });

  it("leaves a refusal in the desktop app to the shell's own toast", () => {
    deepStrictEqual(pasteLanding(URL_, false, "saved", true), {
      channel: null,
      line: { kind: "saved" },
    });
  });
});
