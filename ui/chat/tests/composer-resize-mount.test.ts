// Real-DOM mounts (the interaction-card-mount.test.ts pattern) of the two
// growing fields: the composer's resize handle and the question card's
// free-text answer. jsdom does no layout, so each test stubs the one number
// the code measures (scrollHeight, or the drawn textarea's height).

import { strict as assert } from "node:assert";
import { afterEach, describe, it } from "node:test";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "http://localhost/",
});
const win = dom.window;
const g = globalThis as unknown as Record<string, unknown>;
g.window = win;
g.document = win.document;
Object.defineProperty(g, "navigator", {
  configurable: true,
  value: win.navigator,
});
for (const key of [
  "Element",
  "Event",
  "HTMLElement",
  "HTMLTextAreaElement",
  "KeyboardEvent",
  "MouseEvent",
  "Node",
]) {
  g[key] = (win as unknown as Record<string, unknown>)[key];
}
g.IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(win, "innerHeight", { configurable: true, value: 900 });

const React = await import("react");
const { act, createElement: h } = React;
g.React = React;
const { createRoot } = await import("react-dom/client");
const { ComposerResizeHandle } = await import(
  "../src/composer-resize-handle.tsx"
);
const { FreeTextRow } = await import("../src/interaction-free-text-row.tsx");

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
});

function mount(node: React.ReactElement): HTMLElement {
  const container = win.document.createElement("div");
  win.document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(node));
  cleanup = () => {
    act(() => root.unmount());
    container.remove();
  };
  return container;
}

/** A composer surface whose textarea is drawn `drawnPx` tall, with the handle. */
function mountHandle(drawnPx: number, height: number | null) {
  const calls: (number | null)[] = [];
  const container = mount(
    h(
      "div",
      { "data-composer-surface": "true" },
      h(ComposerResizeHandle, { height, onResize: (v) => calls.push(v) }),
      h("textarea"),
    ),
  );
  const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
  textarea.getBoundingClientRect = () =>
    ({ height: drawnPx }) as unknown as DOMRect;
  const handle = container.querySelector('[role="separator"]') as HTMLElement;
  return { calls, handle };
}

const key = (el: HTMLElement, k: string) =>
  act(() => {
    el.dispatchEvent(
      new win.KeyboardEvent("keydown", { key: k, bubbles: true }),
    );
  });

describe("composer resize handle", () => {
  it("is named by its label, with an English default", () => {
    const { handle } = mountHandle(30, null);
    assert.equal(handle.getAttribute("aria-label"), "Resize message box");
  });

  it("ArrowUp grows the box from its drawn height", () => {
    const { calls, handle } = mountHandle(100, null);
    key(handle, "ArrowUp");
    assert.deepEqual(calls, [124]);
  });

  it("ArrowDown under the minimum hands it back to auto-grow", () => {
    const { calls, handle } = mountHandle(60, 60);
    key(handle, "ArrowDown");
    assert.deepEqual(calls, [null]);
  });

  it("double-click resets to auto-grow", () => {
    const { calls, handle } = mountHandle(400, 400);
    act(() => {
      handle.dispatchEvent(new win.MouseEvent("dblclick", { bubbles: true }));
    });
    assert.deepEqual(calls, [null]);
  });

  it("other keys pass through untouched", () => {
    const { calls, handle } = mountHandle(100, null);
    key(handle, "Enter");
    assert.deepEqual(calls, []);
  });
});

describe("question card free-text field", () => {
  const row = (value: string, scrollPx: number) => {
    Object.defineProperty(win.HTMLTextAreaElement.prototype, "scrollHeight", {
      configurable: true,
      get: () => scrollPx,
    });
    const container = mount(
      h(FreeTextRow, {
        disabled: false,
        onChange: () => undefined,
        onSubmit: () => undefined,
        placeholder: "Type",
        sendLabel: "Send",
        value,
      }),
    );
    return container.querySelector("textarea") as HTMLTextAreaElement;
  };

  it("grows with a long answer", () => {
    const textarea = row("a long answer\nover\nseveral lines", 90);
    assert.equal(textarea.style.height, "90px");
    assert.equal(textarea.style.overflow, "hidden");
  });

  it("stops growing at its cap and scrolls", () => {
    const textarea = row("x".repeat(2000), 600);
    assert.equal(textarea.style.height, "160px");
    assert.equal(textarea.style.overflow, "auto");
  });

  it("an empty field keeps its one-line size", () => {
    const textarea = row("", 40);
    assert.equal(textarea.style.height, "");
  });
});
