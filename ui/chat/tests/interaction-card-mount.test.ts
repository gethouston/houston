// Real-DOM mount of ChatInteractionCard, driving it with native DOM events to
// pin the load-bearing invariant of the controlled `state` / `onStateChange`
// pair: EVERY transition reports, the internal state tracks the controlled one
// (so dropping back to uncontrolled continues seamlessly), and two transitions
// landing in one React batch COMPOSE instead of overwriting each other. The
// pure-logic suite lives in interaction-card.test.ts; the SSR one in
// interaction-card-controlled.test.ts.
//
// This is the DOM-mounting pattern for ui/ packages — reuse it rather than
// inventing a second one: install the jsdom globals (plus the ResizeObserver
// stub and IS_REACT_ACT_ENVIRONMENT) BEFORE the dynamic `react-dom/client`
// import, and drive fields through the native value setter + an `input` event
// so React's value tracker fires onChange.

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { JSDOM } from "jsdom";
import type { ChatInteractionCardProps } from "../src/interaction-card.tsx";
import type {
  ChatInteractionAnswer,
  StepperState,
} from "../src/interaction-card-logic.ts";

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
// Radix's scroll area observes its viewport; jsdom ships no ResizeObserver and
// the layout it would report is irrelevant to these assertions.
g.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
g.IS_REACT_ACT_ENVIRONMENT = true;

const React = await import("react");
const { act, createElement: h, Fragment } = React;
// ui/core's Radix wrappers are authored against the classic JSX runtime, which
// resolves `React` off the global scope.
g.React = React;
const { createRoot } = await import("react-dom/client");
const { ChatInteractionCard } = await import("../src/interaction-card.tsx");
const { InlineTextRow } = await import("../src/interaction-decline-row.tsx");

const Q1: ChatInteractionCardProps["steps"][number] = {
  kind: "question",
  id: "q1",
  question: "Which inbox should I watch?",
  options: [
    { id: "personal", label: "Personal" },
    { id: "work", label: "Work" },
  ],
};
/** Two question steps, so the header pager (Back/Forward) is the card's own. */
const QUESTIONS: ChatInteractionCardProps["steps"] = [
  Q1,
  { kind: "question", id: "q2", question: "How often?" },
];
/** A question followed by a connect step, whose body the test renderer owns. */
const CONNECT_FLOW: ChatInteractionCardProps["steps"] = [
  Q1,
  { kind: "connect", id: "c1", toolkit: "gmail" },
];
/** A connect step ahead of two questions: the shape where an OAuth hand-off
 *  captured on the connect step can resolve after the user has paged on. */
const LATE_CONNECT_FLOW: ChatInteractionCardProps["steps"] = [
  { kind: "connect", id: "c1", toolkit: "gmail" },
  Q1,
  { kind: "question", id: "q2", question: "How often?" },
];
/** A custom step first, so its renderer can fire a draft and a transition from
 *  one handler while a later step still exists to advance to. */
const CUSTOM_FLOW: ChatInteractionCardProps["steps"] = [
  { kind: "custom", id: "x1", title: "Review" },
  Q1,
];

/** The step-scoped api a connect renderer receives. */
type ConnectApi = Parameters<ChatInteractionCardProps["renderConnect"]>[1];

interface Mounted {
  container: HTMLElement;
  render: (props: Partial<ChatInteractionCardProps>) => void;
  unmount: () => void;
}

function mount(props: Partial<ChatInteractionCardProps>): Mounted {
  const container = win.document.createElement("div");
  win.document.body.appendChild(container);
  const root = createRoot(container);
  const base: ChatInteractionCardProps = {
    steps: QUESTIONS,
    onComplete: () => undefined,
    renderConnect: () => null,
    renderSignin: () => null,
    renderCredential: () => null,
  };
  const render = (next: Partial<ChatInteractionCardProps>) => {
    act(() => {
      root.render(h(ChatInteractionCard, { ...base, ...next }));
    });
  };
  render(props);
  return {
    container: container as unknown as HTMLElement,
    render,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

/** Set a field's value the way a user's keystroke does, so React's onChange
 *  sees it (assigning `.value` alone bypasses React's value tracker). */
function typeInto(field: Element, value: string): void {
  const proto =
    field.tagName === "TEXTAREA"
      ? win.HTMLTextAreaElement.prototype
      : win.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  assert.ok(setter, "no native value setter");
  act(() => {
    setter.call(field, value);
    field.dispatchEvent(new win.Event("input", { bubbles: true }));
  });
}

/** Fire an app-held callback outside any DOM event, the way a settled OAuth
 *  promise does. */
function run(fn: () => void): void {
  act(() => {
    fn();
  });
}

function click(el: Element | null | undefined): void {
  assert.ok(el, "element to click is missing");
  act(() => {
    (el as HTMLElement).click();
  });
}

const textarea = (c: HTMLElement): HTMLTextAreaElement => {
  const el = c.querySelector("textarea");
  assert.ok(el, "no free-text field rendered");
  return el as HTMLTextAreaElement;
};

const option = (c: HTMLElement, label: string): Element | undefined =>
  Array.from(c.querySelectorAll('[role="radio"]')).find(
    (el) => el.textContent?.includes(label) === true,
  );

const chevron = (c: HTMLElement, label: string): Element | null =>
  c.querySelector(`[aria-label="${label}"]`);

describe("ChatInteractionCard mounted", () => {
  it("reports the draft, the committed answer and every pager move", () => {
    const seen: StepperState[] = [];
    const card = mount({ onStateChange: (s) => seen.push(s) });

    typeInto(textarea(card.container), "the personal one");
    assert.equal(seen.at(-1)?.drafts.q1, "the personal one");

    click(option(card.container, "Personal"));
    assert.deepEqual(seen.at(-1)?.answers.q1, {
      answer: "Personal",
      optionId: "personal",
    });
    assert.equal(seen.at(-1)?.current, 1);

    click(chevron(card.container, "Back"));
    assert.equal(seen.at(-1)?.current, 0);
    click(chevron(card.container, "Forward"));
    assert.equal(seen.at(-1)?.current, 1);
    card.unmount();
  });

  it("keeps the internal state in sync, so dropping the controlled prop continues from the last reported state", () => {
    let latest: StepperState | undefined;
    const card = mount({
      state: undefined,
      onStateChange: (s) => {
        latest = s;
      },
    });
    // A controlled phase: the caller parks every reported state and hands it
    // straight back, exactly as the app does per conversation.
    card.render({ state: latest, onStateChange: (s) => (latest = s) });
    typeInto(textarea(card.container), "hola");
    card.render({ state: latest, onStateChange: (s) => (latest = s) });
    assert.equal(textarea(card.container).value, "hola");

    card.render({ state: undefined, onStateChange: (s) => (latest = s) });
    assert.equal(textarea(card.container).value, "hola");
    card.unmount();
  });

  it("keeps a restored position and draft when the controlled prop is dropped before any transition", () => {
    // The app hands a parked state back after a remount and then stops
    // controlling; nothing has moved yet, so only the ref carries the position.
    const restored: StepperState = {
      current: 1,
      reached: 1,
      answers: { q1: { answer: "Personal", optionId: "personal" } },
      drafts: { q2: "every morning" },
    };
    const card = mount({ state: restored });
    assert.equal(textarea(card.container).value, "every morning");

    card.render({ state: undefined });
    assert.equal(textarea(card.container).value, "every morning");
    assert.ok(
      card.container.textContent?.includes("How often?"),
      "the card fell back to step 1 instead of the restored position",
    );
    card.unmount();
  });

  it("composes two transitions landing in one React batch", () => {
    const seen: StepperState[] = [];
    const card = mount({
      onStateChange: (s) => seen.push(s),
      steps: CONNECT_FLOW,
      renderConnect: (_step, api) =>
        h("button", {
          onClick: () => {
            api.onDraftChange("wait, use the other account");
            api.pager?.onBack?.();
          },
          type: "button",
          "data-testid": "compose",
        }),
    });
    click(option(card.container, "Work"));
    click(card.container.querySelector('[data-testid="compose"]'));

    const last = seen.at(-1);
    assert.equal(last?.current, 0, "the back move must land");
    assert.equal(
      last?.drafts.c1,
      "wait, use the other account",
      "the draft typed in the same batch must survive the back move",
    );
    card.unmount();
  });

  it("keeps a draft typed before a transition in the same handler", () => {
    const seen: StepperState[] = [];
    const card = mount({
      onStateChange: (s) => seen.push(s),
      steps: CUSTOM_FLOW,
      renderCustom: (_step, api) =>
        h("button", {
          onClick: () => {
            api.onDraftChange("keep me");
            api.onDone();
          },
          type: "button",
          "data-testid": "draft-then-done",
        }),
    });
    click(card.container.querySelector('[data-testid="draft-then-done"]'));

    const last = seen.at(-1);
    assert.equal(last?.current, 1, "the custom step must advance");
    assert.equal(
      last?.drafts.x1,
      "keep me",
      "the draft written before the transition must survive it",
    );
    card.unmount();
  });

  it("gives a non-question step's free-text row a parked draft", () => {
    const seen: StepperState[] = [];
    const card = mount({
      onStateChange: (s) => seen.push(s),
      steps: CONNECT_FLOW,
      renderConnect: (_step, api) =>
        h(
          Fragment,
          null,
          h(InlineTextRow, {
            disabled: false,
            onSubmit: () => undefined,
            onValueChange: api.onDraftChange,
            placeholder: "Tell it what to do instead",
            sendLabel: "Send",
            value: api.draft,
          }),
        ),
    });
    click(option(card.container, "Work"));
    const field = card.container.querySelector("input");
    assert.ok(field, "the connect step's free-text row is missing");
    typeInto(field, "book it manually");
    assert.equal(seen.at(-1)?.drafts.c1, "book it manually");
    assert.equal((field as HTMLInputElement).value, "book it manually");
    card.unmount();
  });
  it("ignores a step-leaving callback captured on a step the user paged away from", () => {
    const seen: StepperState[] = [];
    const completed: ChatInteractionAnswer[][] = [];
    let first: ConnectApi | undefined;
    let live: ConnectApi | undefined;
    const card = mount({
      onComplete: (answers) => completed.push(answers),
      onStateChange: (s) => seen.push(s),
      steps: LATE_CONNECT_FLOW,
      renderConnect: (_step, api) => {
        first ??= api;
        live = api;
        return h(
          Fragment,
          null,
          h("button", {
            "data-testid": "connect-back",
            onClick: () => api.pager?.onBack?.(),
            type: "button",
          }),
          h("button", {
            "data-testid": "connect-forward",
            onClick: () => api.pager?.onForward?.(),
            type: "button",
          }),
        );
      },
    });

    // Skip the connect step and answer q1, landing on the final question.
    run(() => first?.onSkip());
    click(option(card.container, "Personal"));
    assert.equal(seen.at(-1)?.current, 2);

    // Walk back onto the connect step, then forward again to the final
    // question while the hand-off captured on the first render is pending.
    click(chevron(card.container, "Back"));
    click(chevron(card.container, "Back"));
    assert.equal(seen.at(-1)?.current, 0);
    click(card.container.querySelector('[data-testid="connect-forward"]'));
    click(chevron(card.container, "Forward"));
    assert.equal(seen.at(-1)?.current, 2);

    const reportsBefore = seen.length;
    run(() => first?.onConnected());
    assert.equal(
      seen.length,
      reportsBefore,
      "the stale onConnected reported a state nothing moved",
    );
    assert.deepEqual(
      completed,
      [],
      "the stale onConnected completed the sequence from a step it never owned",
    );
    assert.equal(
      seen.at(-1)?.current,
      2,
      "the stale onConnected moved the pager",
    );
    assert.deepEqual(
      Object.keys(seen.at(-1)?.answers ?? {}),
      ["q1"],
      "the stale onConnected touched the committed answers",
    );

    // The live callback on the step it belongs to still advances.
    click(chevron(card.container, "Back"));
    click(chevron(card.container, "Back"));
    run(() => live?.onConnected());
    assert.equal(
      seen.at(-1)?.current,
      1,
      "the connect step's own onConnected must still advance",
    );
    card.unmount();
  });
});
