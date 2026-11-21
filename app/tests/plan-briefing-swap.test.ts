import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
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
for (const key of ["Element", "HTMLElement", "Node"]) {
  g[key] = (win as unknown as Record<string, unknown>)[key];
}
g.IS_REACT_ACT_ENVIRONMENT = true;

const React = await import("react");
const { act, createElement: h } = React;
g.React = React;
const { createRoot } = await import("react-dom/client");
const { BriefingStep } = await import(
  "../src/components/shell/plan-briefing-swap.tsx"
);

type Step = "intro" | "pick" | "done";

function content(step: Step) {
  if (step === "pick") {
    return h(
      "div",
      null,
      h("h2", { tabIndex: -1 }, "Which organization stays free?"),
      h("input", { type: "radio", name: "org", value: "innova" }),
      h("input", {
        type: "radio",
        name: "org",
        value: "la-fila",
        defaultChecked: true,
      }),
    );
  }
  return h(
    "div",
    null,
    h(
      "h2",
      { tabIndex: -1 },
      step === "intro" ? "Teams" : "La Fila stays free",
    ),
    h("button", { type: "button" }, step === "intro" ? "Choose" : "Done"),
  );
}

function mount() {
  const host = document.createElement("div");
  document.body.append(host);
  const outside = document.createElement("button");
  document.body.append(outside);
  const root = createRoot(host);
  const show = (step: Step) =>
    act(() => root.render(h(BriefingStep, { step }, content(step))));
  const frame = () => host.firstElementChild as HTMLElement;
  const focused = () => {
    const el = document.activeElement as HTMLElement | null;
    return el?.tagName === "INPUT"
      ? `radio ${(el as HTMLInputElement).value}`
      : `${el?.tagName.toLowerCase()} ${el?.textContent}`;
  };
  const unmount = () => {
    act(() => root.unmount());
    host.remove();
    outside.remove();
  };
  return { host, outside, show, frame, focused, unmount };
}

describe("a briefing step swap", () => {
  it("opens without its entrance and leaves focus where the dialog put it", async () => {
    const { outside, show, frame, focused, unmount } = mount();
    outside.textContent = "autofocus";
    outside.focus();
    await show("intro");
    assert.equal(frame().className, "flex flex-1 flex-col");
    assert.equal(focused(), "button autofocus");
    await show("intro");
    assert.equal(focused(), "button autofocus");
    unmount();
  });

  it("mounts the next step fresh, with its entrance, focused on the checked radio", async () => {
    const { show, frame, focused, unmount } = mount();
    await show("intro");
    const first = frame();
    await show("pick");
    assert.notEqual(frame(), first);
    assert.equal(first.isConnected, false);
    assert.equal(frame().className, "flex flex-1 flex-col plan-briefing-step");
    assert.equal(focused(), "radio la-fila");
    unmount();
  });

  it("focuses the title of a step with no radio, and re-renders without moving focus", async () => {
    const { host, show, focused, unmount } = mount();
    await show("pick");
    await show("done");
    assert.equal(focused(), "h2 La Fila stays free");
    (host.querySelector("button") as HTMLButtonElement).focus();
    await show("done");
    assert.equal(focused(), "button Done");
    unmount();
  });
});
