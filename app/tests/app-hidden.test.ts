import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { type AppHiddenSource, onAppHidden } from "../src/lib/app-hidden.ts";

/**
 * The window going away is not a React unmount.
 *
 * Everything that must be durable before the process ends hangs off this rule,
 * so it is driven here against a fake page rather than a browser.
 */
function fakePage() {
  const listeners = new Map<string, Set<() => void>>();
  let hidden = false;

  const source: AppHiddenSource = {
    on: (type, handler) => {
      const set = listeners.get(type) ?? new Set<() => void>();
      set.add(handler);
      listeners.set(type, set);
    },
    off: (type, handler) => {
      listeners.get(type)?.delete(handler);
    },
    isHidden: () => hidden,
  };

  return {
    source,
    fire: (type: string) => {
      for (const handler of [...(listeners.get(type) ?? [])]) handler();
    },
    setHidden: (value: boolean) => {
      hidden = value;
    },
    listening: () =>
      [...listeners.values()].reduce((total, set) => total + set.size, 0),
  };
}

describe("onAppHidden", () => {
  it("hears the window closing", () => {
    // The desktop's WKWebView delivers `pagehide` on quit; it is the only
    // notice a flush that must survive the shutdown will ever get.
    const page = fakePage();
    let hidden = 0;
    onAppHidden(() => {
      hidden += 1;
    }, page.source);

    page.fire("pagehide");
    strictEqual(hidden, 1);
  });

  it("hears the window going off screen", () => {
    const page = fakePage();
    let hidden = 0;
    onAppHidden(() => {
      hidden += 1;
    }, page.source);

    page.setHidden(true);
    page.fire("visibilitychange");
    strictEqual(hidden, 1);
  });

  it("says nothing when the window comes BACK", () => {
    // Both directions raise the same event; only one of them is a goodbye.
    const page = fakePage();
    let hidden = 0;
    onAppHidden(() => {
      hidden += 1;
    }, page.source);

    page.setHidden(false);
    page.fire("visibilitychange");
    strictEqual(hidden, 0);
  });

  it("reports every goodbye, so a cmd-tab away is durable too", () => {
    const page = fakePage();
    let hidden = 0;
    onAppHidden(() => {
      hidden += 1;
    }, page.source);

    page.setHidden(true);
    page.fire("visibilitychange");
    page.setHidden(false);
    page.fire("visibilitychange");
    page.setHidden(true);
    page.fire("visibilitychange");
    strictEqual(hidden, 2);
  });

  it("lets go of the page entirely", () => {
    const page = fakePage();
    let hidden = 0;
    const stop = onAppHidden(() => {
      hidden += 1;
    }, page.source);
    strictEqual(page.listening(), 2);

    stop();
    strictEqual(page.listening(), 0);
    page.setHidden(true);
    page.fire("pagehide");
    page.fire("visibilitychange");
    strictEqual(hidden, 0);
  });
});
