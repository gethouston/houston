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
g.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
g.IS_REACT_ACT_ENVIRONMENT = true;

const React = await import("react");
const { act, createElement: h, Fragment } = React;
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
const QUESTIONS: ChatInteractionCardProps["steps"] = [
  Q1,
  { kind: "question", id: "q2", question: "How often?" },
];
const CONNECT_FLOW: ChatInteractionCardProps["steps"] = [
  Q1,
  { kind: "connect", id: "c1", toolkit: "gmail" },
];
const LATE_CONNECT_FLOW: ChatInteractionCardProps["steps"] = [
  { kind: "connect", id: "c1", toolkit: "gmail" },
  Q1,
  { kind: "question", id: "q2", question: "How often?" },
];
const CUSTOM_FLOW: ChatInteractionCardProps["steps"] = [
  { kind: "custom", id: "x1", title: "Review" },
  Q1,
];

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
  it("shows the hire role and palette dot while instructions stay closed until opened", () => {
    const card = mount({
      steps: [
        {
          kind: "question",
          id: "hire",
          question: "Hire Document Collector?",
          hire: {
            color: "forest",
            role: "Client document collection specialist",
            instructions: "You chase documents.\n\n- Follow up",
            instructionsLabel: "See their instructions",
          },
          options: [
            { kind: "approval", id: "approve", label: "Yes, go ahead" },
            { kind: "approval", id: "decline", label: "No, don't do it" },
          ],
        },
      ],
    });
    const details = card.container.querySelector("details");
    assert.ok(details);
    assert.equal(details.open, false);
    assert.equal(
      card.container.querySelector("summary")?.textContent,
      "See their instructions",
    );
    assert.ok(
      card.container.textContent?.includes(
        "Client document collection specialist",
      ),
    );
    assert.ok(card.container.querySelector('[style*="--ht-agent-forest"]'));
    click(card.container.querySelector("summary"));
    assert.equal(details.open, true);
    assert.ok(details.textContent?.includes("You chase documents."));
    card.unmount();
  });
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
    card.render({ state: latest, onStateChange: (s) => (latest = s) });
    typeInto(textarea(card.container), "hola");
    card.render({ state: latest, onStateChange: (s) => (latest = s) });
    assert.equal(textarea(card.container).value, "hola");

    card.render({ state: undefined, onStateChange: (s) => (latest = s) });
    assert.equal(textarea(card.container).value, "hola");
    card.unmount();
  });

  it("keeps a restored position and draft when the controlled prop is dropped before any transition", () => {
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

    run(() => first?.onSkip());
    click(option(card.container, "Personal"));
    assert.equal(seen.at(-1)?.current, 2);

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
