// Real-DOM mount of the parked-interaction binding (PRODUCT-1902): one card,
// one outcome log, one seed — read at mount and never re-read, so nothing that
// re-renders the panel can restore stale state over what the user just did.
//
// The card driven here is the REAL ui/chat stepper; only the app's own step
// bodies are stubbed. `interactionStepCards` cannot be loaded by the node test
// runner (the connect / credential cards reach `import.meta.env` and a
// dependency node's ESM loader rejects in strict mode), which is why the
// binding lives in `useParkedInteractionCard` rather than inside the component
// that assembles those bodies.
//
// The DOM-mounting pattern is ui/chat's (`tests/interaction-card-mount.test.ts`):
// install the jsdom globals and IS_REACT_ACT_ENVIRONMENT BEFORE the dynamic
// `react-dom/client` import, and drive fields through the native value setter.

import { strict as assert } from "node:assert";
import { beforeEach, describe, it } from "node:test";
import type { InteractionStep } from "@houston/protocol";
import type {
  ChatInteractionAnswer,
  ChatInteractionCardProps,
  ChatInteractionStep,
} from "@houston-ai/chat";
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
// Radix's scroll area observes its viewport; jsdom ships no ResizeObserver and
// the layout it would report is irrelevant to these assertions.
g.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
g.IS_REACT_ACT_ENVIRONMENT = true;

const React = await import("react");
const { act, createElement: h, Fragment, useEffect } = React;
// No tsconfig `jsx` setting is in scope for `ui/`'s sources under this runner,
// so their JSX transpiles to classic `React.createElement` calls — which read
// `React` off the global scope.
g.React = React;
const { createRoot } = await import("react-dom/client");
const { ChatInteractionCard } = await import("@houston-ai/chat");
const { createInteractionOutcomes } = await import(
  "../src/components/chat-interaction-reply.ts"
);
const { useParkedInteractionCard } = await import(
  "../src/components/use-parked-interaction-card.ts"
);
const { approvalsFromAnswers } = await import(
  "../src/lib/interaction-approvals.ts"
);
const { finalConnectNames } = await import(
  "../src/lib/interaction-outcomes.ts"
);
const { interactionDraftKey, useInteractionDraftStore } = await import(
  "../src/stores/interaction-drafts.ts"
);
type ParkedInteraction = Parameters<
  ReturnType<typeof useInteractionDraftStore.getState>["park"]
>[1];

const SESSION = "activity-A";

const FOLDER: InteractionStep = {
  kind: "question",
  id: "q1",
  question: "Which folder?",
  options: [
    { id: "inbox", label: "Inbox" },
    { id: "archive", label: "Archive" },
  ],
};
const WHEN: InteractionStep = {
  kind: "question",
  id: "q2",
  question: "How often?",
};
/** An approval: it decides one exact host-issued request (`requestId`), so a
 *  committed answer for it may never survive a remount. */
const APPROVAL: InteractionStep = {
  kind: "question",
  id: "a1",
  requestId: "r1",
  question: "Delete the old exports?",
  options: [
    { kind: "approval", id: "approve", label: "Yes, delete them" },
    { kind: "approval", id: "decline", label: "Cancel" },
  ],
};
const CONNECT: InteractionStep = {
  kind: "connect",
  id: "c1",
  toolkit: "gmail",
};

/** The same steps as the card sees them. The app maps protocol steps into
 *  ui/chat steps (`mapInteractionSteps`); every shape used here passes through
 *  unchanged, so the test states both rather than depending on the mapping. */
const asCardStep = (step: InteractionStep): ChatInteractionStep =>
  step as ChatInteractionStep;

interface Completion {
  answers: ChatInteractionAnswer[];
  outcomes: ReturnType<typeof createInteractionOutcomes>;
}

/** The step api the card hands a connect body — the object a connect flow that
 *  outlives the card still holds when it finally resolves. */
type ConnectApi = Parameters<ChatInteractionCardProps["renderConnect"]>[1];

interface HarnessProps {
  steps: InteractionStep[];
  identity: string;
  onComplete: (completion: Completion) => void;
  /** Hands out the connect api built on THIS render, so a test can keep one
   *  past the card's unmount. */
  captureConnect?: (api: ConnectApi) => void;
}

/** One mounted interaction card bound to the conversation's parked state —
 *  the app's own composition minus the step bodies it cannot load here,
 *  including `ChatInteractionStepper`'s liveness guard on the send. */
function Harness({
  steps,
  identity,
  onComplete,
  captureConnect,
}: HarnessProps) {
  const { outcomes, state, onStateChange, isLive } = useParkedInteractionCard({
    sessionKey: SESSION,
    identity,
    steps,
  });
  return h(ChatInteractionCard, {
    onComplete: (answers) => {
      if (!isLive()) return;
      onComplete({ answers, outcomes });
    },
    onStateChange,
    // Stands in for the app's connect body: the free-text escape row is what a
    // returning card's user types into.
    renderConnect: (_step, api) => {
      captureConnect?.(api);
      return h("textarea", {
        onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) =>
          api.onDraftChange(e.target.value),
        value: api.draft,
      });
    },
    renderCredential: () => null,
    renderSignin: () => null,
    state,
    steps: steps.map(asCardStep),
  });
}

/** A component whose own mount effect parks — standing in for a step body that
 *  advances itself on mount, whose effect runs BEFORE the card's. */
function ParksFirst({ entry }: { entry: ParkedInteraction }) {
  useEffect(() => {
    useInteractionDraftStore.getState().park(SESSION, entry);
  }, [entry]);
  return null;
}

interface Mounted {
  container: HTMLElement;
  unmount: () => void;
}

function mount(node: React.ReactNode): Mounted {
  const container = win.document.createElement("div");
  win.document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(node);
  });
  return {
    container: container as unknown as HTMLElement,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function mountCard(
  steps: InteractionStep[],
  onComplete: (completion: Completion) => void = () => undefined,
): Mounted {
  return mount(
    h(Harness, { identity: interactionDraftKey(steps), onComplete, steps }),
  );
}

/** Set a field's value the way a user's keystroke does, so React's onChange
 *  sees it (assigning `.value` alone bypasses React's value tracker). */
function typeInto(field: Element, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    field.tagName === "TEXTAREA"
      ? win.HTMLTextAreaElement.prototype
      : win.HTMLInputElement.prototype,
    "value",
  )?.set;
  assert.ok(setter, "no native value setter");
  act(() => {
    setter.call(field, value);
    field.dispatchEvent(new win.Event("input", { bubbles: true }));
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
  Array.from(c.querySelectorAll('[role="radio"]')).find((el) =>
    el.textContent?.includes(label),
  );

/** The decline pill carries its Esc keycap inside the same button. */
const button = (c: HTMLElement, label: string): Element | undefined =>
  Array.from(c.querySelectorAll("button")).find((el) =>
    el.textContent?.includes(label),
  );

const parkedNow = () => useInteractionDraftStore.getState().parked[SESSION];

function park(steps: InteractionStep[], entry: Omit<ParkedInteraction, "key">) {
  const full = { ...entry, key: interactionDraftKey(steps) };
  useInteractionDraftStore.getState().park(SESSION, full);
  return full;
}

describe("a card bound to its conversation's parked state (PRODUCT-1902)", () => {
  beforeEach(() => {
    useInteractionDraftStore.getState().reset();
  });

  it("parks what the user typed, under this conversation and this interaction", () => {
    const steps = [FOLDER];
    const card = mountCard(steps);

    typeInto(textarea(card.container), "the invoices one");

    const entry = parkedNow();
    assert.equal(entry?.key, interactionDraftKey(steps));
    assert.equal(entry?.state.drafts.q1, "the invoices one");
    // A different interaction in the same conversation is a different card.
    assert.notEqual(entry?.key, interactionDraftKey([WHEN]));
    card.unmount();
  });

  it("hands a returning card back its position and its typed text", () => {
    const steps = [FOLDER, WHEN];
    park(steps, {
      state: {
        current: 1,
        reached: 1,
        answers: { q1: { answer: "Inbox", optionId: "inbox" } },
        drafts: { q2: "every morning" },
      },
      outcomes: createInteractionOutcomes(),
    });

    const card = mountCard(steps);

    assert.ok(
      card.container.textContent?.includes("How often?"),
      "the card reopened on the first step instead of the parked one",
    );
    assert.equal(textarea(card.container).value, "every morning");
    card.unmount();
  });

  it("re-asks a parked approval instead of replaying it", () => {
    const steps = [APPROVAL, WHEN];
    park(steps, {
      state: {
        current: 1,
        reached: 1,
        answers: { a1: { answer: "Yes, delete them", optionId: "approve" } },
        drafts: {},
      },
      outcomes: createInteractionOutcomes(),
    });
    let completed: Completion | undefined;

    const card = mountCard(steps, (c) => {
      completed = c;
    });

    assert.ok(
      card.container.textContent?.includes("Delete the old exports?"),
      "the card stood past the approval it had already been clicked for",
    );
    assert.equal(
      parkedNow()?.state.answers.a1,
      undefined,
      "the committed approval is still parked",
    );

    // Walk the sequence out WITHOUT clicking the approval again: the reply
    // must carry no receipt for a request the user was never shown.
    click(button(card.container, "Skip"));
    typeInto(textarea(card.container), "every morning");
    click(card.container.querySelector('[aria-label="Send"]'));
    assert.ok(completed, "the sequence never completed");
    assert.deepEqual(
      approvalsFromAnswers(steps.map(asCardStep), completed.answers),
      [],
    );
    card.unmount();
  });

  it("restores what earlier steps ended up as, so the reply still reports them", () => {
    const steps = [CONNECT, FOLDER];
    const parkedOutcomes = createInteractionOutcomes();
    parkedOutcomes.connects.set("c1", {
      name: "Gmail",
      connected: false,
      message: "forward them by hand instead",
    });
    park(steps, {
      state: { current: 1, reached: 1, answers: {}, drafts: {} },
      outcomes: parkedOutcomes,
    });
    let completed: Completion | undefined;

    const card = mountCard(steps, (c) => {
      completed = c;
    });
    click(option(card.container, "Inbox"));

    assert.ok(completed, "the sequence never completed");
    // The very fold `interactionReplyMessage` composes its connect lines from.
    assert.deepEqual(finalConnectNames(["c1"], completed.outcomes.connects), {
      connectedNames: [],
      skippedConnectNames: [],
      connectRedirects: [
        { name: "Gmail", text: "forward them by hand instead" },
      ],
    });
    // The restore copies into the mounted card's OWN log, leaving the parked
    // one intact for the next return.
    assert.notEqual(completed.outcomes, parkedOutcomes);
    card.unmount();
  });

  it("leaves a step that parked during its own mount alone", () => {
    const steps = [APPROVAL, WHEN];
    // Needs stripping, so the card would otherwise write its seed at mount.
    park(steps, {
      state: {
        current: 1,
        reached: 1,
        answers: { a1: { answer: "Yes, delete them", optionId: "approve" } },
        drafts: {},
      },
      outcomes: createInteractionOutcomes(),
    });
    const fromStep = {
      key: interactionDraftKey(steps),
      state: { current: 1, reached: 1, answers: {}, drafts: { q2: "weekly" } },
      outcomes: createInteractionOutcomes(),
    };

    const card = mount(
      h(
        Fragment,
        null,
        h(ParksFirst, { entry: fromStep, key: "parks-first" }),
        h(Harness, {
          identity: interactionDraftKey(steps),
          key: "card",
          onComplete: () => undefined,
          steps,
        }),
      ),
    );

    assert.equal(
      parkedNow(),
      fromStep,
      "the mount seed overwrote what a step had already parked",
    );
    card.unmount();
  });

  it("ignores a transition replayed by a card the user already left", () => {
    const steps = [CONNECT];
    const sends: Completion[] = [];
    let stale: ConnectApi | undefined;

    const first = mount(
      h(Harness, {
        captureConnect: (api) => {
          stale = api;
        },
        identity: interactionDraftKey(steps),
        onComplete: (c) => sends.push(c),
        steps,
      }),
    );
    assert.ok(stale, "the connect step never rendered");
    first.unmount();

    // The user comes back and starts typing an instruction instead.
    const second = mountCard(steps, (c) => sends.push(c));
    typeInto(textarea(second.container), "forward them by hand");
    assert.equal(parkedNow()?.state.drafts.c1, "forward them by hand");

    // Only NOW the browser connect flow the first card started resolves, into
    // an instance that is gone.
    act(() => {
      stale?.onConnected();
    });

    assert.equal(
      parkedNow()?.state.drafts.c1,
      "forward them by hand",
      "a dead card's transition parked over the live one",
    );
    assert.equal(sends.length, 0, "a dead card's completion reached the send");
    second.unmount();
  });
});
