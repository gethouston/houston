import { strict as assert } from "node:assert";
import { beforeEach, describe, it } from "node:test";
import "./support/dom-env.ts";

const g = globalThis as unknown as Record<string, unknown>;
const win = g.window as Window & typeof globalThis;
for (const key of [
  "CustomEvent",
  "DOMRect",
  "FocusEvent",
  "HTMLButtonElement",
  "HTMLInputElement",
  "HTMLTextAreaElement",
  "HTMLSelectElement",
  "SVGElement",
  "ShadowRoot",
  "Text",
  "DocumentFragment",
  "KeyboardEvent",
  "MouseEvent",
  "MutationObserver",
  "NodeFilter",
  "PointerEvent",
  "getComputedStyle",
  "requestAnimationFrame",
  "cancelAnimationFrame",
])
  g[key] = (win as unknown as Record<string, unknown>)[key];
win.matchMedia = ((query: string) => ({
  matches: false,
  media: query,
  addEventListener() {},
  removeEventListener() {},
})) as unknown as typeof win.matchMedia;
const observers = new Set<() => void>();
g.ResizeObserver = class {
  constructor(private readonly callback: () => void) {}
  observe() {
    observers.add(this.callback);
  }
  unobserve() {}
  disconnect() {
    observers.delete(this.callback);
  }
};

const React = await import("react");
const { act, createElement: h, useEffect } = React;
g.React = React;
const { createRoot } = await import("react-dom/client");
const i18next = (await import("i18next")).default;
const { initReactI18next } = await import("react-i18next");
const teams = (
  await import("../src/locales/en/teams.json", { with: { type: "json" } })
).default;
const { PageHeaderToolsProvider, usePageHeaderSlotRef } = await import(
  "../src/components/shell/page-header/page-header-tools.tsx"
);
const { CompanyContextTool } = await import(
  "../src/components/organization/company-context-tool.tsx"
);

await i18next.use(initReactI18next).init({
  lng: "en",
  ns: ["teams"],
  defaultNS: "teams",
  resources: { en: { teams } },
});

let stripWidth = 500;
let mounts = 0;
let opened = 0;

function Probe() {
  useEffect(() => {
    mounts += 1;
  }, []);
  return h("textarea", { "aria-label": "probe editor" });
}

function Strip() {
  const strip = usePageHeaderSlotRef("strip");
  const tools = usePageHeaderSlotRef("tools");
  return h(
    "div",
    {
      ref: (el: HTMLElement | null) => {
        if (el)
          Object.defineProperty(el, "clientWidth", {
            configurable: true,
            get: () => stripWidth,
          });
        strip(el);
      },
    },
    h("div", { ref: tools, "data-slot": "tools" }),
  );
}

async function mount() {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      h(
        PageHeaderToolsProvider,
        { thresholds: { oneRowMin: 720 } },
        h(Strip),
        h(CompanyContextTool, { onOpened: () => (opened += 1) }, h(Probe)),
      ),
    ),
  );
  return {
    trigger: () =>
      document.querySelector<HTMLButtonElement>(
        "[data-company-context-trigger]",
      ),
    sheet: () => document.querySelector("[data-testid=company-context-sheet]"),
    resize: async (width: number) => {
      stripWidth = width;
      await act(async () => {
        for (const notify of observers) notify();
      });
    },
    unmount: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

beforeEach(() => {
  stripWidth = 500;
  mounts = 0;
  opened = 0;
  Object.defineProperty(win, "innerWidth", { configurable: true, value: 1024 });
});

describe("Admin's Company context sheet", () => {
  it("caps the phone bottom sheet at the shared 80dvh sheet size", async () => {
    Object.defineProperty(win, "innerWidth", {
      configurable: true,
      value: 390,
    });
    const view = await mount();
    await act(async () => view.trigger()?.click());
    const sheet = view.sheet();
    assert.ok(sheet);
    assert.match(sheet.className, /max-h-\[80dvh\]/);
    assert.doesNotMatch(sheet.className, /85dvh/);
    await view.unmount();
  });
  it("draws a closed pill and no editor until someone opens it", async () => {
    const view = await mount();
    const trigger = view.trigger();
    assert.ok(trigger, "the pill renders");
    assert.equal(trigger.textContent, "Company context");
    assert.equal(trigger.getAttribute("aria-haspopup"), "dialog");
    assert.equal(trigger.getAttribute("aria-expanded"), "false");
    assert.equal(view.sheet(), null);
    assert.equal(mounts, 0);
    assert.equal(opened, 0);
    await view.unmount();
  });

  it("opens the sheet with the editor inside and reports the open once", async () => {
    const view = await mount();
    await act(async () => view.trigger()?.click());
    const sheet = view.sheet();
    assert.ok(sheet, "the sheet is open");
    assert.ok(sheet.querySelector("textarea[aria-label='probe editor']"));
    assert.match(sheet.textContent ?? "", /Company context/);
    assert.equal(view.trigger()?.getAttribute("aria-expanded"), "true");
    assert.equal(mounts, 1);
    assert.equal(opened, 1);
    await view.unmount();
  });

  it("keeps ONE editor while the header crosses its threshold", async () => {
    const view = await mount();
    await act(async () => view.trigger()?.click());
    assert.equal(mounts, 1);
    await view.resize(900);
    assert.ok(
      document.querySelector(
        "[data-slot=tools] [data-company-context-trigger]",
      ),
      "the pill moved into the strip",
    );
    await view.resize(500);
    assert.equal(
      document.querySelector(
        "[data-slot=tools] [data-company-context-trigger]",
      ),
      null,
      "the pill left the strip",
    );
    assert.ok(view.sheet(), "the sheet stayed open");
    assert.equal(mounts, 1, "the editor was never remounted");
    assert.equal(opened, 1);
    await view.unmount();
  });
});
