import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  isExpectedClipboardRefusal,
  shareToLinkedIn,
} from "../src/components/organization/org-chart-share-run.ts";

/** A promise this test settles by hand. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("shareToLinkedIn", () => {
  it("opens LinkedIn in the click's own tick, after starting the copy and before any await", async () => {
    const calls: string[] = [];
    const copy = deferred<void>();
    const running = shareToLinkedIn("Hello", {
      writeText: (text) => {
        calls.push(`copy:${text}`);
        return copy.promise;
      },
      open: async (url) => {
        calls.push(`open:${new URL(url).host}`);
        return true;
      },
      report: () => calls.push("report"),
    });
    // Synchronously, before the copy settles: both have been called.
    deepStrictEqual(calls, ["copy:Hello", "open:www.linkedin.com"]);
    copy.resolve();
    const result = await running;
    strictEqual(result.opened, true);
    strictEqual(result.copied, true);
  });

  it("hands back the URL when the browser blocked the tab", async () => {
    const result = await shareToLinkedIn("Hi", {
      writeText: async () => {},
      open: async () => false,
      report: () => {},
    });
    strictEqual(result.opened, false);
    strictEqual(new URL(result.url).searchParams.get("text"), "Hi");
  });

  it("opens even with no clipboard, and reports nothing for it", async () => {
    const reports: string[] = [];
    const result = await shareToLinkedIn("Hi", {
      writeText: undefined,
      open: async () => true,
      report: (command) => reports.push(command),
    });
    deepStrictEqual([result.opened, result.copied, reports], [true, false, []]);
  });

  it("treats a refused clipboard as the person's setup, and anything else as a bug", async () => {
    const reports: string[] = [];
    const deps = (error: unknown) => ({
      writeText: async () => {
        throw error;
      },
      open: async () => true,
      report: (command: string) => reports.push(command),
    });
    await shareToLinkedIn("Hi", deps(new DOMException("x", "NotAllowedError")));
    deepStrictEqual(reports, []);
    await shareToLinkedIn("Hi", deps(new TypeError("boom")));
    deepStrictEqual(reports, ["org_chart_share_copy_text"]);
  });
});

describe("isExpectedClipboardRefusal", () => {
  it("is only NotAllowedError", () => {
    strictEqual(
      isExpectedClipboardRefusal(new DOMException("x", "NotAllowedError")),
      true,
    );
    strictEqual(isExpectedClipboardRefusal(new Error("x")), false);
    strictEqual(isExpectedClipboardRefusal(undefined), false);
  });
});
