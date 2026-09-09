// @vitest-environment jsdom
import { createElement, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ScopeStore } from "../store";
import { useSdkSnapshot } from "./use-sdk-snapshot";

/**
 * The synthetic turn burst behind "Maximum update depth exceeded" (React
 * #185): a stream hands the conversation VM one frame per microtask, and a
 * subscriber whose passive effect mirrors the snapshot into local state — the
 * everyday "derive state from the feed" shape — leaves default-lane work
 * pending after each sync commit. Notified per publish, React counted 50+ of
 * those commits as one nested chain and threw into `ScopeStore.publish`, which
 * failed the turn. The binding must coalesce the burst into one render.
 */

// Real scheduling, not `act()`: the bug is precisely about how React batches
// (or fails to batch) outside a test-controlled flush.
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

    // Each frame's publish is separated from the next by a microtask only —
    // exactly how the SSE reader (`await onEvent(frame)`) drains a chunk.
    for (let n = 1; n <= BURST; n++) {
      store.publish("conversation/x", { n });
      await Promise.resolve();
    }
    await settle();

    // The publisher was never thrown into: the last frame landed and rendered.
    expect(store.getSnapshot("conversation/x")).toEqual({ n: BURST });
    expect(host.innerHTML).toBe(`<output>${BURST}/${BURST}</output>`);
    // One coalesced notification (plus the mirror effect's own commit), not one
    // sync render per frame.
    expect(renders - rendersBefore).toBeLessThanOrEqual(4);
  });
});
