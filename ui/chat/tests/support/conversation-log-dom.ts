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
g.IntersectionObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
g.IS_REACT_ACT_ENVIRONMENT = true;

const PANE = "conversation-scroll-pane";
export const CONTENT_HEIGHT = 1000;
export const layout = { viewport: 400, scrollTop: 0 };
export const maxScroll = () => CONTENT_HEIGHT - layout.viewport;
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
g.React = React;
const { createRoot } = await import("react-dom/client");

export const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 120));
  });

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

export function resizeViewport(pane: HTMLElement, height: number): void {
  layout.viewport = height;
  layout.scrollTop = Math.min(layout.scrollTop, maxScroll());
  const observer = observers.find((entry) => entry.targets.includes(pane));
  assert.ok(observer, "nothing observes the scroll pane");
  act(() => observer.callback());
}

export function scrollTo(pane: HTMLElement, top: number): void {
  layout.scrollTop = top;
  act(() => {
    pane.dispatchEvent(new win.Event("scroll"));
  });
}
