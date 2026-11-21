import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { JSDOM } from "jsdom";
import type { BrowserLiveViewInput } from "../src/browser-live-types.ts";
import type { BrowserLiveViewProps } from "../src/browser-live-view.tsx";

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
  "HTMLInputElement",
  "HTMLTextAreaElement",
  "KeyboardEvent",
  "MouseEvent",
  "Node",
  "cancelAnimationFrame",
  "getComputedStyle",
  "requestAnimationFrame",
]) {
  g[key] = (win as unknown as Record<string, unknown>)[key];
}
g.IS_REACT_ACT_ENVIRONMENT = true;

const React = await import("react");
const { act, createElement: h } = React;
g.React = React;
const { createRoot } = await import("react-dom/client");
const { BrowserLiveView } = await import("../src/browser-live-view.tsx");

const NO_FRAMES: BrowserLiveViewProps["frames"] = {
  subscribe: () => () => {},
  latest: () => null,
};

interface Mounted {
  container: HTMLElement;
  sent: BrowserLiveViewInput[][];
  calls: string[];
  unmount: () => void;
}

function mount(props: Partial<BrowserLiveViewProps>): Mounted {
  const container = win.document.createElement("div");
  win.document.body.appendChild(container);
  const root = createRoot(container);
  const sent: BrowserLiveViewInput[][] = [];
  const calls: string[] = [];
  const base: BrowserLiveViewProps = {
    state: "live",
    task: "Sign in to your bank",
    url: "https://bank.example.com/login",
    title: "Bank",
    frames: NO_FRAMES,
    expiresAt: 0,
    onInput: (events) => sent.push(events),
    onDone: () => calls.push("done"),
    onCancel: () => calls.push("cancel"),
    onClose: () => calls.push("close"),
    onRetry: () => calls.push("retry"),
  };
  act(() => root.render(h(BrowserLiveView, { ...base, ...props })));
  return {
    container,
    sent,
    calls,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function button(container: HTMLElement, text: string): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find(
    (b) =>
      b.textContent?.trim() === text || b.getAttribute("aria-label") === text,
  );
  if (!found) throw new Error(`no button "${text}"`);
  return found;
}

function click(el: HTMLElement) {
  act(() => {
    el.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
  });
}

const buttonTexts = (container: HTMLElement) =>
  [...container.querySelectorAll("button")].map(
    (b) => b.textContent?.trim() || b.getAttribute("aria-label"),
  );

describe("browser live view", () => {
  it("shows the task, Back, the address, Cancel and I'm done while live", () => {
    const m = mount({});
    strictEqual(
      m.container.textContent?.includes("Sign in to your bank"),
      true,
    );
    const address = m.container.querySelector("input[name=address]");
    strictEqual(
      (address as HTMLInputElement).value,
      "https://bank.example.com/login",
    );
    deepStrictEqual(buttonTexts(m.container), [
      "Close",
      "Back",
      "Cancel",
      "I'm done",
    ]);
    click(button(m.container, "I'm done"));
    click(button(m.container, "Cancel"));
    click(button(m.container, "Close"));
    click(button(m.container, "Back"));
    deepStrictEqual(m.calls, ["done", "cancel", "close"]);
    deepStrictEqual(m.sent, [[{ type: "back" }]]);
    m.unmount();
  });

  it("overlays Connecting and holds I'm done until the page shows", () => {
    const m = mount({ state: "connecting" });
    strictEqual(m.container.textContent?.includes("Connecting"), true);
    strictEqual(button(m.container, "I'm done").disabled, true);
    m.unmount();
  });

  it("offers Try again when the connection is lost", () => {
    const m = mount({ state: "lost" });
    strictEqual(
      m.container.textContent?.includes("The connection was lost."),
      true,
    );
    click(button(m.container, "Try again"));
    deepStrictEqual(m.calls, ["retry"]);
    m.unmount();
  });

  const ended: [BrowserLiveViewProps["state"], string][] = [
    ["done", "Done. You can close this."],
    ["cancelled", "You closed the browser."],
    ["expired", "Time ran out. Ask in the chat to try again."],
    ["none", "This browser is no longer waiting for you."],
    ["not_owner", "Only the person who asked can use this browser."],
  ];
  for (const [state, message] of ended) {
    it(`ends on ${state} with its message and only Close`, () => {
      const m = mount({ state });
      strictEqual(m.container.textContent?.includes(message), true);
      deepStrictEqual(buttonTexts(m.container), ["Close", "Back", "Close"]);
      m.unmount();
    });
  }

  it("focuses the hidden text field on pointerup and sends what is typed", () => {
    const m = mount({});
    const canvas = m.container.querySelector(
      "[data-testid=browser-live-canvas]",
    ) as HTMLCanvasElement;
    const field = m.container.querySelector(
      "[data-testid=browser-live-keyboard]",
    ) as HTMLTextAreaElement;
    const Pointer =
      (win as unknown as { PointerEvent?: typeof MouseEvent }).PointerEvent ??
      win.MouseEvent;
    act(() => {
      canvas.dispatchEvent(
        new Pointer("pointerdown", { bubbles: true, button: 0 }),
      );
      canvas.dispatchEvent(
        new Pointer("pointerup", { bubbles: true, button: 0 }),
      );
    });
    strictEqual(win.document.activeElement, field);
    act(() => {
      field.value = "hello";
      field.dispatchEvent(new win.Event("input", { bubbles: true }));
    });
    deepStrictEqual(m.sent.at(-1), [{ type: "text", text: "hello" }]);
    strictEqual(field.value, "");
    m.unmount();
  });

  it("keeps Tab and Escape for the page; Shift+Escape moves to the controls", () => {
    const m = mount({});
    const field = m.container.querySelector(
      "[data-testid=browser-live-keyboard]",
    ) as HTMLTextAreaElement;
    const hint = win.document.getElementById(
      field.getAttribute("aria-describedby") ?? "",
    );
    strictEqual(hint?.textContent?.includes("Shift+Escape"), true);
    act(() => field.focus());
    const press = (init: KeyboardEventInit) =>
      act(() => {
        field.dispatchEvent(
          new win.KeyboardEvent("keydown", { bubbles: true, ...init }),
        );
      });
    press({ key: "Tab" });
    press({ key: "Escape" });
    deepStrictEqual(m.sent, [
      [{ type: "key", key: "Tab" }],
      [{ type: "key", key: "Escape" }],
    ]);
    strictEqual(win.document.activeElement, field);
    press({ key: "Escape", shiftKey: true });
    strictEqual(m.sent.length, 2);
    strictEqual(win.document.activeElement, button(m.container, "Back"));
    m.unmount();
  });

  it("shows the minutes left before the deadline", () => {
    const m = mount({ expiresAt: Date.now() + 4 * 60_000 + 1_000 });
    strictEqual(m.container.textContent?.includes("5 min left"), true);
    m.unmount();
  });

  it("turns the countdown to the attention colour in the last minute", () => {
    const m = mount({ expiresAt: Date.now() + 45_000 });
    strictEqual(
      m.container.textContent?.includes("Less than a minute left"),
      true,
    );
    strictEqual(m.container.querySelector("[data-urgent]") !== null, true);
    m.unmount();
  });

  it("holds a page-shaped skeleton until the first frame paints", () => {
    const m = mount({ state: "connecting" });
    strictEqual(
      m.container.querySelector("[data-testid=browser-live-skeleton]") !== null,
      true,
    );
    m.unmount();
    const ended = mount({ state: "done" });
    strictEqual(
      ended.container.querySelector("[data-testid=browser-live-skeleton]"),
      null,
    );
    ended.unmount();
  });
});
