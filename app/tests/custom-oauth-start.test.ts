import { deepStrictEqual, rejects, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { ReservedTab } from "../src/lib/browser-tab.ts";
import {
  SIGN_IN_WAKING_RETRY_MS,
  startCustomOAuth,
} from "../src/lib/custom-oauth-start.ts";

class Waking extends Error {}

const URL = "https://issuer.example.com/oauth/authorize?state=abc";

function fakeTab(opts: { closed?: boolean } = {}) {
  const navigated: string[] = [];
  let discarded = 0;
  const tab: ReservedTab = {
    navigate: (url) => {
      if (opts.closed) return false;
      navigated.push(url);
      return true;
    },
    discard: () => {
      discarded += 1;
    },
  };
  return { tab, navigated, discarded: () => discarded };
}

function harness(overrides: { tab?: ReservedTab | null; opens?: boolean }) {
  const opened: string[] = [];
  const slept: number[] = [];
  return {
    opened,
    slept,
    deps: {
      mint: async () => ({ authorizeUrl: URL }),
      open: async (url: string) => {
        opened.push(url);
        return overrides.opens ?? true;
      },
      tab: overrides.tab ?? null,
      isWaking: (err: unknown) => err instanceof Waking,
      sleep: async (ms: number) => {
        slept.push(ms);
      },
    },
  };
}

describe("startCustomOAuth", () => {
  it("navigates the tab claimed inside the click and never opens a second one", async () => {
    const { tab, navigated } = fakeTab();
    const h = harness({ tab });
    deepStrictEqual(await startCustomOAuth(h.deps), {
      authorizeUrl: URL,
      opened: true,
    });
    deepStrictEqual(navigated, [URL]);
    deepStrictEqual(h.opened, []);
  });

  it("falls back to the plain open when the claimed tab was closed meanwhile", async () => {
    const { tab } = fakeTab({ closed: true });
    const h = harness({ tab });
    strictEqual((await startCustomOAuth(h.deps)).opened, true);
    deepStrictEqual(h.opened, [URL]);
  });

  it("reports a refused open as a result, keeping the URL for a manual click", async () => {
    const h = harness({ opens: false });
    deepStrictEqual(await startCustomOAuth(h.deps), {
      authorizeUrl: URL,
      opened: false,
    });
  });

  it("re-mints along the ladder while the pod is waking", async () => {
    const h = harness({});
    let attempts = 0;
    h.deps.mint = async () => {
      attempts += 1;
      if (attempts < 3) throw new Waking("waking");
      return { authorizeUrl: URL };
    };
    strictEqual((await startCustomOAuth(h.deps)).opened, true);
    strictEqual(attempts, 3);
    deepStrictEqual(h.slept, SIGN_IN_WAKING_RETRY_MS.slice(0, 2));
  });

  it("surfaces any other mint failure at once and discards the empty tab", async () => {
    const { tab, discarded } = fakeTab();
    const h = harness({ tab });
    h.deps.mint = async () => {
      throw new Error("registration refused");
    };
    await rejects(startCustomOAuth(h.deps), /registration refused/);
    strictEqual(discarded(), 1);
    deepStrictEqual(h.slept, []);
    deepStrictEqual(h.opened, []);
  });

  it("gives up after the ladder and surfaces the last waking refusal", async () => {
    const h = harness({});
    h.deps.mint = async () => {
      throw new Waking("still waking");
    };
    await rejects(startCustomOAuth(h.deps), Waking);
    deepStrictEqual(h.slept, [...SIGN_IN_WAKING_RETRY_MS]);
  });
});
