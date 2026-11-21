// @vitest-environment jsdom
import { createElement, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ScopeStore } from "../store";
import { useSdkSnapshot } from "./use-sdk-snapshot";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = false;

const BURST = 120;

function Probe({
  store,
  onRender,
}: {
  store: ScopeStore;
  onRender: () => void;
}) {
  const snapshot = useSdkSnapshot<{ n: number }>(store, "conversation/x");
  const [mirror, setMirror] = useState(0);
  onRender();
  useEffect(() => {
    if (snapshot) setMirror(snapshot.n);
  }, [snapshot]);
  return createElement("output", null, `${snapshot?.n ?? "none"}/${mirror}`);
}

function settle(ms = 20): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("useSdkSnapshot under a microtask-gapped publish burst", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
  });
  afterEach(() => {
    root.unmount();
    host.remove();
  });

  it("publishes every frame without tripping React's nested-update limit", async () => {
    const store = new ScopeStore();
    let renders = 0;
    root = createRoot(host);
    root.render(
      createElement(Probe, {
        store,
        onRender: () => {
          renders++;
        },
      }),
    );
    await settle();
    const rendersBefore = renders;

    for (let n = 1; n <= BURST; n++) {
      store.publish("conversation/x", { n });
      await Promise.resolve();
    }
    await settle();

    expect(store.getSnapshot("conversation/x")).toEqual({ n: BURST });
    expect(host.innerHTML).toBe(`<output>${BURST}/${BURST}</output>`);
    expect(renders - rendersBefore).toBeLessThanOrEqual(4);
  });
});
