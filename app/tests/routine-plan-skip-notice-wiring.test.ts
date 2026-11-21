import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { TriggerPlanSkipNotice } from "@houston/sdk";
import { JSDOM } from "jsdom";
import en from "../src/locales/en/plan.json" with { type: "json" };

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
  "MouseEvent",
  "Node",
  "getComputedStyle",
]) {
  g[key] = (win as unknown as Record<string, unknown>)[key];
}
g.IS_REACT_ACT_ENVIRONMENT = true;

const React = await import("react");
const { act, createElement: h } = React;
g.React = React;
const { createRoot } = await import("react-dom/client");
const i18next = (await import("i18next")).default;
const { initReactI18next } = await import("react-i18next");
await i18next.use(initReactI18next).init({
  lng: "en",
  ns: ["plan"],
  react: { useSuspense: false },
  resources: { en: { plan: en } },
});
const { RoutinePlanSkipNoticeControls } = await import(
  "../src/components/agent/routine-plan-skip-notice-controls.tsx"
);

const base = { count: 3, lastAt: "2026-10-05T19:43:49Z" };
const limit: TriggerPlanSkipNotice = {
  ...base,
  reason: "routine_limit",
  actions: ["keep_routine", "upgrade"],
};
const paused: TriggerPlanSkipNotice = {
  ...base,
  reason: "inactive_paused",
  actions: ["resume", "upgrade"],
};

function mount(notice: TriggerPlanSkipNotice, resuming = false) {
  const calls: string[] = [];
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() =>
    root.render(
      h(RoutinePlanSkipNoticeControls, {
        notice,
        onLeave: () => calls.push("leave"),
        effects: {
          openBilling: () => calls.push("billing"),
          openKeepChooser: () => calls.push("keep"),
          resume: () => calls.push("resume"),
          resuming,
        },
      }),
    ),
  );
  const button = (label: string) => {
    const found = [...container.querySelectorAll("button")].find(
      (b) => b.textContent === label,
    );
    assert.ok(found, `no "${label}" button`);
    return found;
  };
  const click = (label: string) =>
    act(() => {
      button(label).dispatchEvent(
        new win.MouseEvent("click", { bubbles: true }),
      );
    });
  const unmount = () => {
    act(() => root.unmount());
    container.remove();
  };
  return { calls, button, click, unmount };
}

describe("RoutinePlanSkipNoticeControls", () => {
  it("closes the host before opening Billing", () => {
    const view = mount(limit);
    view.click(en.upgrade);
    assert.deepEqual(view.calls, ["leave", "billing"]);
    view.unmount();
  });

  it("closes the host before opening the keep chooser", () => {
    const view = mount(limit);
    view.click(en.chooseRoutine);
    assert.deepEqual(view.calls, ["leave", "keep"]);
    view.unmount();
  });

  it("resumes in place, without leaving", () => {
    const view = mount(paused);
    view.click(en.resume);
    assert.deepEqual(view.calls, ["resume"]);
    view.unmount();
  });

  it("disables Resume while it is in flight, and only Resume", () => {
    const view = mount(paused, true);
    assert.equal(view.button(en.resume).disabled, true);
    assert.equal(view.button(en.upgrade).disabled, false);
    view.unmount();
  });
});
