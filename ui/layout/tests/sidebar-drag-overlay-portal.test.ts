// Real-DOM mount (jsdom globals BEFORE the dynamic react-dom import). The drag
// overlay is `position: fixed`, and a fixed box resolves against the nearest
// transformed ancestor instead of the viewport. The rail's list plays an
// entrance animation on `transform`, so an overlay mounted inside it during
// that animation is placed (and measured by dnd-kit as the collision rect)
// far from the pointer, and the drop lands on the wrong row. The overlay must
// therefore live outside the rail's subtree.

import { strict as assert } from "node:assert";
import { it } from "node:test";
import { JSDOM } from "jsdom";
import type { SidebarGroupView } from "../src/sidebar-groups.ts";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "http://localhost/",
});
const g = globalThis as unknown as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
Object.defineProperty(g, "navigator", {
  configurable: true,
  value: dom.window.navigator,
});
for (const key of ["Element", "HTMLElement", "Node", "Event"]) {
  g[key] = (dom.window as unknown as Record<string, unknown>)[key];
}
g.IS_REACT_ACT_ENVIRONMENT = true;

const React = await import("react");
const { act, createElement: h } = React;
const { createRoot } = await import("react-dom/client");
const { SidebarGroupedList } = await import("../src/sidebar-grouped-list.tsx");

const items = ["A", "B"].map((id) => ({ id, name: id }));
const groups: SidebarGroupView[] = [];

function pointer(type: string, y: number): Event {
  const event = new dom.window.MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: 10,
    clientY: y,
  });
  Object.defineProperty(event, "isPrimary", { value: true });
  Object.defineProperty(event, "pointerType", { value: "mouse" });
  return event;
}

it("draws the drag overlay outside the rail's (animated) subtree", async () => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(() =>
    root.render(
      h(SidebarGroupedList, {
        items,
        groups,
        order: [
          { kind: "agent", id: "A" },
          { kind: "agent", id: "B" },
        ],
        rowCtx: { selectedId: null, onSelect: () => {} },
        onArrange: () => true,
      }),
    ),
  );
  const button = container.querySelector<HTMLElement>(
    '[data-item-id="A"] button',
  );
  assert.ok(button);
  await act(() => button.dispatchEvent(pointer("pointerdown", 10)));
  await act(() => document.dispatchEvent(pointer("pointermove", 30)));

  const overlay = document.querySelector(".shadow-drag");
  assert.ok(overlay, "the drag is active and its overlay is drawn");
  assert.equal(
    container.contains(overlay),
    false,
    "the overlay is portalled out of the rail",
  );

  await act(() => document.dispatchEvent(pointer("pointerup", 30)));
  await act(() => root.unmount());
  container.remove();
});
