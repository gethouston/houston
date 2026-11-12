// A jsdom stage for mounting the conversation log. jsdom has no layout, so
// the scroll pane's geometry is a stub the test drives (`layout`), and
// ResizeObserver is a stub the test fires. Reduced motion is on, so every
// scroll the log makes is instant. Import it BEFORE anything that loads
// react-dom: it installs the globals React reads at import time.
// DOM-mounting pattern: interaction-card-mount.test.ts.

import { strict as assert } from "node:assert";
import { JSDOM } from "jsdom";
import type { ReactElement } from "react";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "http://localhost/",
});
export const win = dom.window;
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
  "Node",
  "cancelAnimationFrame",
  "getComputedStyle",
  "requestAnimationFrame",
]) {
  g[key] = (win as unknown as Record<string, unknown>)[key];
}
(win as unknown as { matchMedia: unknown }).matchMedia = () => ({
  matches: true,
  addEventListener() {},
  removeEventListener() {},
});

/** Every observer created, so a test can report a resize to the pane's. */
const observers: { callback: () => void; targets: Element[] }[] = [];
g.ResizeObserver = class {
  private readonly entry: { callback: () => void; targets: Element[] };
  constructor(callback: () => void) {
    this.entry = { callback, targets: [] };
    observers.push(this.entry);
  }
  observe(target: Element) {
    this.entry.targets.push(target);
  }
  unobserve() {}
  disconnect() {
    this.entry.targets = [];
  }
};
// The Conversation Map watches which moments are on screen; nothing here
// asks it.
g.IntersectionObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
g.IS_REACT_ACT_ENVIRONMENT = true;

const PANE = "conversation-scroll-pane";
export const CONTENT_HEIGHT = 1000;
/** The pane's stubbed geometry; `scrollTop` clamps like a browser's. */
export const layout = { viewport: 400, scrollTop: 0 };
export const maxScroll = () => CONTENT_HEIGHT - layout.viewport;
/** Where use-stick-to-bottom parks a pinned log: one pixel above the true
 *  bottom. */
export const pinnedTop = () => CONTENT_HEIGHT - 1 - layout.viewport;
const isPane = (el: Element) => el.classList.contains(PANE);
const proto = win.HTMLElement.prototype;
Object.defineProperty(proto, "clientHeight", {
  configurable: true,
  get(this: Element) {
    return isPane(this) ? layout.viewport : 0;
  },
});
Object.defineProperty(proto, "scrollHeight", {
  configurable: true,
  get(this: Element) {
    return isPane(this) ? CONTENT_HEIGHT : 0;
  },
});
Object.defineProperty(proto, "scrollTop", {
  configurable: true,
  get(this: Element) {
    return isPane(this) ? layout.scrollTop : 0;
  },
  set(this: Element, value: number) {
    if (isPane(this))
      layout.scrollTop = Math.max(0, Math.min(value, maxScroll()));
  },
});

const React = await import("react");
const { act } = React;
// ui/core's Radix wrappers are authored against the classic JSX runtime, which
// resolves `React` off the global scope.
g.React = React;
const { createRoot } = await import("react-dom/client");

/** A few frames: the library scrolls from requestAnimationFrame. */
export const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 120));
  });

/** Mounts a fresh tree and returns a re-render for it plus its scroll pane. */
export function mountLog(element: ReactElement): {
  pane: HTMLElement;
  render: (next: ReactElement) => void;
} {
  observers.length = 0;
  win.document.body.innerHTML = "";
  const container = win.document.createElement("div");
  win.document.body.appendChild(container);
  const root = createRoot(container);
  const render = (next: ReactElement) => act(() => root.render(next));
  render(element);
  const pane = container.querySelector(`.${PANE}`);
  assert.ok(pane, "the scroll pane did not mount");
  return { pane: pane as HTMLElement, render };
}

/** The viewport changes height and the pane's observer reports it. */
export function resizeViewport(pane: HTMLElement, height: number): void {
  layout.viewport = height;
  layout.scrollTop = Math.min(layout.scrollTop, maxScroll());
  const observer = observers.find((entry) => entry.targets.includes(pane));
  assert.ok(observer, "nothing observes the scroll pane");
  act(() => observer.callback());
}

/** The person scrolls the pane to `top`. */
export function scrollTo(pane: HTMLElement, top: number): void {
  layout.scrollTop = top;
  act(() => {
    pane.dispatchEvent(new win.Event("scroll"));
  });
}
