// The wide chart opens centred on its root, measured from the first real
// box: while Admin is hidden (kept alive, display: none) every measure is 0,
// and centring then would be centring on nothing.

import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import "./support/dom-env.ts";

const React = await import("react");
const { act, createElement: h } = React;
(globalThis as Record<string, unknown>).React = React;
const { createRoot } = await import("react-dom/client");
const { useCentreOnce } = await import(
  "../src/components/organization/use-centre-once.ts"
);

let observed: (() => void) | null = null;
(globalThis as Record<string, unknown>).ResizeObserver = class {
  constructor(callback: () => void) {
    observed = callback;
  }
  observe() {}
  disconnect() {
    observed = null;
  }
};

function sized(el: HTMLElement, client: number, scroll: number) {
  Object.defineProperty(el, "clientWidth", {
    configurable: true,
    value: client,
  });
  Object.defineProperty(el, "scrollWidth", {
    configurable: true,
    value: scroll,
  });
}

describe("useCentreOnce", () => {
  it("waits for the first non-zero size, centres once, then lets the scroll be", async () => {
    let node: HTMLDivElement | null = null;
    function Probe() {
      const ref = useCentreOnce<HTMLDivElement>();
      return h("div", {
        ref: (el: HTMLDivElement | null) => {
          if (el) {
            node = el;
            sized(el, 0, 0);
          }
          ref(el);
        },
      });
    }
    const root = createRoot(document.createElement("div"));
    await act(async () => root.render(h(Probe)));
    const el = node as unknown as HTMLDivElement;
    strictEqual(el.scrollLeft, 0);
    // Admin becomes visible: the box gets its real size.
    sized(el, 400, 1000);
    await act(async () => observed?.());
    strictEqual(el.scrollLeft, 300);
    strictEqual(observed, null);
    // The person scrolls; a later re-render never yanks it back.
    el.scrollLeft = 12;
    await act(async () => root.render(h(Probe)));
    strictEqual(el.scrollLeft, 12);
    await act(async () => root.unmount());
  });
});
