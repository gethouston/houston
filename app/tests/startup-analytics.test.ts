import { strictEqual, deepStrictEqual, ok } from "node:assert";
import { describe, it } from "node:test";

import {
  runStartupAnalytics,
  welcomeBridgeUrl,
  type StartupAnalytics,
} from "../src/lib/startup-analytics.ts";

/**
 * Records the order of analytics calls so we can assert `install_created`
 * is emitted before any onboarding event would be (the whole point of the
 * relocation — see runStartupAnalytics docs).
 */
function fakeAnalytics(init: { installId: string; isNew: boolean }) {
  const calls: string[] = [];
  const analytics: StartupAnalytics = {
    init: async () => {
      calls.push("init");
      return init;
    },
    trackActive: async () => {
      calls.push("trackActive");
    },
    track: (event) => {
      calls.push(`track:${event}`);
    },
  };
  return { analytics, calls };
}

describe("welcomeBridgeUrl", () => {
  it("builds the /welcome attribution bridge URL with an encoded install_id", () => {
    strictEqual(
      welcomeBridgeUrl("abc 123"),
      "https://gethouston.ai/welcome?install_id=abc%20123",
    );
  });
});

describe("runStartupAnalytics", () => {
  it("emits install_created AFTER identify(init) and BEFORE session_started on a new install", async () => {
    const { analytics, calls } = fakeAnalytics({ installId: "id-1", isNew: true });
    const opened: string[] = [];

    await runStartupAnalytics(analytics, async (url) => {
      opened.push(url);
    });

    const installIdx = calls.indexOf("track:install_created");
    const sessionIdx = calls.indexOf("track:session_started");
    const initIdx = calls.indexOf("init");

    ok(initIdx >= 0, "init must run");
    ok(installIdx > initIdx, "install_created must fire after identify (init)");
    ok(
      sessionIdx > installIdx,
      "session_started must fire after install_created",
    );
    // The attribution bridge opened with the install id.
    deepStrictEqual(opened, [welcomeBridgeUrl("id-1")]);
  });

  it("does NOT emit install_created for a returning install, but still emits session_started", async () => {
    const { analytics, calls } = fakeAnalytics({ installId: "id-1", isNew: false });
    const opened: string[] = [];

    await runStartupAnalytics(analytics, async (url) => {
      opened.push(url);
    });

    ok(
      !calls.includes("track:install_created"),
      "install_created must not fire on a returning install",
    );
    ok(calls.includes("track:session_started"), "session_started always fires");
    deepStrictEqual(opened, [], "no attribution bridge for a returning install");
  });

  it("skips the attribution bridge when init returns no install id", async () => {
    const { analytics } = fakeAnalytics({ installId: "", isNew: true });
    const opened: string[] = [];

    await runStartupAnalytics(analytics, async (url) => {
      opened.push(url);
    });

    deepStrictEqual(opened, []);
  });

  it("never rejects when the attribution bridge open fails", async () => {
    const { analytics, calls } = fakeAnalytics({ installId: "id-1", isNew: true });

    await runStartupAnalytics(analytics, async () => {
      throw new Error("no default browser");
    });

    // The failure is swallowed; session_started still fires.
    ok(calls.includes("track:install_created"));
    ok(calls.includes("track:session_started"));
  });
});
