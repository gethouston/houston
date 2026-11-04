import { strict as assert } from "node:assert";
import { afterEach, beforeEach, it } from "node:test";
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
  "Node",
  "getComputedStyle",
]) {
  g[key] = (win as unknown as Record<string, unknown>)[key];
}
g.IS_REACT_ACT_ENVIRONMENT = true;
const media = new win.EventTarget();
Object.defineProperty(win, "matchMedia", {
  value: () => ({
    matches: win.innerWidth < 768,
    addEventListener: media.addEventListener.bind(media),
    removeEventListener: media.removeEventListener.bind(media),
  }),
});
const observers = new Set<() => void>();
g.ResizeObserver = class {
  constructor(private callback: () => void) {}
  observe() {
    observers.add(this.callback);
  }
  disconnect() {
    observers.delete(this.callback);
  }
};
win.HTMLTextAreaElement.prototype.getBoundingClientRect = function () {
  return new win.DOMRect(0, 0, 100, Number.parseFloat(this.style.height) || 23);
};
Object.defineProperty(win.HTMLTextAreaElement.prototype, "scrollHeight", {
  configurable: true,
  get: () => 23,
});

const React = await import("react");
const { act, createElement: h } = React;
g.React = React;
const { createRoot } = await import("react-dom/client");
const { ChatInputForm } = await import("../src/chat-input-form.tsx");

let cleanup: (() => void) | undefined;
beforeEach(() => {
  Object.defineProperty(win, "innerWidth", { configurable: true, value: 1024 });
  Object.defineProperty(win, "innerHeight", { configurable: true, value: 900 });
});
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

function mount() {
  const container = win.document.createElement("div");
  win.document.body.appendChild(container);
  const root = createRoot(container);
  const noop = () => undefined;
  act(() =>
    root.render(
      h(ChatInputForm, {
        text: "",
        placeholder: "Message",
        status: "ready",
        hasContent: false,
        disabled: false,
        dictating: false,
        onSubmit: noop,
        onOpenFilePicker: noop,
        onOpenFolderPicker: noop,
        onTextChange: noop,
        onKeyDown: noop,
        onPaste: noop,
        onSelect: noop,
      }),
    ),
  );
  cleanup = () => {
    act(() => root.unmount());
    container.remove();
  };
  const textarea = container.querySelector("textarea");
  const handle = container.querySelector<HTMLElement>('[role="separator"]');
  assert.ok(textarea);
  assert.ok(handle);
  return { textarea, handle };
}

function grow(handle: HTMLElement, times: number) {
  for (let i = 0; i < times; i++) {
    act(() => {
      handle.dispatchEvent(
        new win.KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }),
      );
      for (const callback of observers) callback();
    });
  }
}

it("phone width ignores a desktop manual height and desktop can resume it", () => {
  const { handle, textarea } = mount();
  // The existing empty-box keyboard bug is tested separately.
  textarea.style.height = "100px";
  grow(handle, 5);
  const desktopHeight = textarea.style.height;
  assert.equal(desktopHeight, "220px");
  act(() => {
    Object.defineProperty(win, "innerWidth", {
      configurable: true,
      value: 390,
    });
    media.dispatchEvent(new win.Event("change"));
    win.dispatchEvent(new win.Event("resize"));
  });
  assert.equal(textarea.style.height, "");
  assert.equal(textarea.style.maxHeight, "");
  act(() => {
    Object.defineProperty(win, "innerWidth", {
      configurable: true,
      value: 1024,
    });
    media.dispatchEvent(new win.Event("change"));
  });
  assert.equal(textarea.style.height, desktopHeight);
});

it("a resize event clamps the mounted composer to the smaller viewport", () => {
  const { handle, textarea } = mount();
  textarea.style.height = "100px";
  grow(handle, 20);
  assert.equal(textarea.style.height, "580px");
  act(() => {
    Object.defineProperty(win, "innerHeight", {
      configurable: true,
      value: 500,
    });
    win.dispatchEvent(new win.Event("resize"));
  });
  assert.equal(textarea.style.height, "260px");
  assert.equal(textarea.style.maxHeight, "260px");
});

it("auto mode announces the empty textarea's measured height", () => {
  const { handle } = mount();
  assert.equal(handle.getAttribute("aria-valuenow"), "23");
});

it("auto mode follows the textarea's measured growth", () => {
  const { handle, textarea } = mount();
  act(() => {
    textarea.style.height = "100px";
    for (const callback of observers) callback();
  });
  assert.equal(handle.getAttribute("aria-valuenow"), "100");
});

it("unmount removes resize listeners and textarea observers", () => {
  mount();
  cleanup?.();
  cleanup = undefined;
  assert.equal(observers.size, 0);
  act(() => win.dispatchEvent(new win.Event("resize")));
});
