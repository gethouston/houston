import { strict as assert } from "node:assert";
import { afterEach, describe, it } from "node:test";
import { JSDOM } from "jsdom";
import type { ComposerDraftStore } from "../src/use-composer-draft.ts";

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
(win as unknown as { matchMedia: unknown }).matchMedia = () => ({
  matches: false,
  addEventListener() {},
  removeEventListener() {},
});
g.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
g.IS_REACT_ACT_ENVIRONMENT = true;

const React = await import("react");
const { act, createElement: h } = React;
g.React = React;
const { createRoot } = await import("react-dom/client");
const { ChatInput } = await import("../src/chat-input.tsx");

function memoryStore(initial: Record<string, string>) {
  const texts = { ...initial };
  const listeners = new Set<() => void>();
  const store: ComposerDraftStore = {
    get: (key) => texts[key] ?? "",
    set: (key, text) => {
      texts[key] = text;
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return { store, texts, listeners };
}

let cleanup: (() => void) | undefined;
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

function mount(props: Partial<Parameters<typeof ChatInput>[0]>) {
  const container = win.document.createElement("div");
  win.document.body.appendChild(container);
  const root = createRoot(container);
  const render = (next: Partial<Parameters<typeof ChatInput>[0]>) =>
    act(() => root.render(h(ChatInput, { onSend: () => {}, ...next })));
  render(props);
  cleanup = () => {
    act(() => root.unmount());
    container.remove();
  };
  const textarea = container.querySelector("textarea");
  assert.ok(textarea);
  return { textarea, render };
}

const setValue = Object.getOwnPropertyDescriptor(
  win.HTMLTextAreaElement.prototype,
  "value",
)?.set;
function type(textarea: HTMLTextAreaElement, text: string) {
  act(() => {
    setValue?.call(textarea, text);
    textarea.dispatchEvent(new win.Event("input", { bubbles: true }));
  });
}

describe("ChatInput with a draftStore", () => {
  it("writes keystrokes to the store under its draft key", () => {
    const { store, texts } = memoryStore({});
    const { textarea } = mount({ draftStore: store, draftKey: "a" });
    type(textarea, "hi");
    assert.equal(texts.a, "hi");
    assert.equal(textarea.value, "hi");
  });

  it("shows outside writes and follows a draft key switch", () => {
    const { store } = memoryStore({ a: "for a", b: "for b" });
    const { textarea, render } = mount({ draftStore: store, draftKey: "a" });
    assert.equal(textarea.value, "for a");
    act(() => store.set("a", "rewritten"));
    assert.equal(textarea.value, "rewritten");
    render({ draftStore: store, draftKey: "b" });
    assert.equal(textarea.value, "for b");
  });

  it("drops its subscription on unmount", () => {
    const { store, listeners } = memoryStore({});
    mount({ draftStore: store, draftKey: "a" });
    assert.equal(listeners.size, 1);
    cleanup?.();
    cleanup = undefined;
    assert.equal(listeners.size, 0);
  });

  it("keeps its own text without a store", () => {
    const { textarea } = mount({ draftKey: "a" });
    type(textarea, "local");
    assert.equal(textarea.value, "local");
  });
});
