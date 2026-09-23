// Real-DOM mount of the shell every "connect something" step renders through,
// for the one behavior its free-text row owns: a decline WITH an instruction
// relays the text and then empties the row. The step's draft is parked by the
// stepper and a decline commits nothing, so text left behind would sit in the
// row again when the user walks back onto the step.
//
// The DOM-mounting pattern is ui/chat's (`tests/interaction-card-mount.test.ts`).

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
for (const key of [
  "CSSStyleDeclaration",
  "DOMRect",
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
g.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
g.IS_REACT_ACT_ENVIRONMENT = true;

const React = await import("react");
const { act, createElement: h, useState } = React;
g.React = React;
const { createRoot } = await import("react-dom/client");
const i18next = (await import("i18next")).default;
const { initReactI18next } = await import("react-i18next");
// The shell's copy comes through `t()`; an empty catalog echoes the key back,
// which is all these assertions need to find the controls.
await i18next.use(initReactI18next).init({
  defaultNS: "chat",
  fallbackLng: "en",
  lng: "en",
  ns: ["chat"],
  react: { useSuspense: false },
  resources: { en: { chat: {} } },
});
const { ChatConnectStepShell } = await import(
  "../src/components/chat-connect-step-shell.tsx"
);

/** The shell with its draft parked by the caller, as the stepper parks it. */
function Harness({ onDecline }: { onDecline: (message?: string) => void }) {
  const [draft, setDraft] = useState("");
  return h(ChatConnectStepShell, {
    busy: false,
    collapseLabel: "Collapse",
    disabled: false,
    dismissLabel: "Dismiss",
    done: false,
    draft,
    expandLabel: "Expand",
    icon: null,
    onDecline,
    onDraftChange: setDraft,
    onOpenChange: () => undefined,
    open: true,
    pager: null,
    reason: "I need access to your mailbox.",
    stepId: "c1",
    title: "Connect Gmail",
  });
}

function typeInto(field: Element, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    win.HTMLInputElement.prototype,
    "value",
  )?.set;
  assert.ok(setter, "no native value setter");
  act(() => {
    setter.call(field, value);
    field.dispatchEvent(new win.Event("input", { bubbles: true }));
  });
}

describe("a connect step's free-text decline", () => {
  it("relays the typed instruction and empties the row", () => {
    const declines: (string | undefined)[] = [];
    const container = win.document.createElement("div");
    win.document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(h(Harness, { onDecline: (m) => declines.push(m) }));
    });

    const field = container.querySelector("input");
    assert.ok(field, "the step's free-text row is missing");
    typeInto(field, "just forward them by hand");
    const send = container.querySelector('[aria-label="questionCard.send"]');
    assert.ok(send, "the row's send button is missing");
    act(() => {
      (send as HTMLElement).click();
    });

    assert.deepEqual(declines, ["just forward them by hand"]);
    assert.equal(
      (field as HTMLInputElement).value,
      "",
      "the sent instruction is still sitting in the row",
    );

    act(() => root.unmount());
    container.remove();
  });
});
