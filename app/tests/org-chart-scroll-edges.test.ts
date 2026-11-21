import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import "./support/dom-env.ts";
import {
  edgeMask,
  NO_EDGES,
  scrollEdges,
} from "../src/components/organization/org-chart-scroll-edges.ts";

const React = await import("react");
const { act, createElement: h } = React;
(globalThis as Record<string, unknown>).React = React;
const { createRoot } = await import("react-dom/client");
const { useScrollEdges } = await import(
  "../src/components/organization/use-scroll-edges.ts"
);

describe("scrollEdges", () => {
  it("reads which sides hide content", () => {
    const at = (scrollLeft: number) =>
      scrollEdges({ scrollLeft, scrollWidth: 1000, clientWidth: 400 });
    deepStrictEqual(at(0), { start: false, end: true });
    deepStrictEqual(at(300), { start: true, end: true });
    deepStrictEqual(at(599.5), { start: true, end: false });
  });

  it("hides nothing when it fits, or before it has a size", () => {
    deepStrictEqual(
      scrollEdges({ scrollLeft: 0, scrollWidth: 400, clientWidth: 400 }),
      NO_EDGES,
    );
    deepStrictEqual(
      scrollEdges({ scrollLeft: 0, scrollWidth: 0, clientWidth: 0 }),
      NO_EDGES,
    );
  });
});

describe("edgeMask", () => {
  it("fades only the sides that hide content", () => {
    strictEqual(edgeMask(NO_EDGES), undefined);
    strictEqual(
      edgeMask({ start: false, end: true }),
      "linear-gradient(to right, black, black, black calc(100% - 48px), transparent)",
    );
    strictEqual(
      edgeMask({ start: true, end: false }),
      "linear-gradient(to right, transparent, black 48px, black, black)",
    );
  });
});

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

describe("useScrollEdges", () => {
  it("opens on the left edge, then follows the size and the scroll", async () => {
    let node: HTMLDivElement | null = null;
    let seen = NO_EDGES;
    function Probe() {
      const { ref, edges } = useScrollEdges<HTMLDivElement>();
      seen = edges;
      return h("div", {
        ref: (el: HTMLDivElement | null) => {
          if (el && !node) {
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
    deepStrictEqual(seen, NO_EDGES);
    sized(el, 400, 1000);
    await act(async () => observed?.());
    strictEqual(el.scrollLeft, 0);
    deepStrictEqual(seen, { start: false, end: true });
    el.scrollLeft = 600;
    await act(async () => el.dispatchEvent(new Event("scroll")));
    deepStrictEqual(seen, { start: true, end: false });
    await act(async () => root.unmount());
    strictEqual(observed, null);
  });
});
