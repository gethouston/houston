import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { beforeEach, describe, it } from "node:test";
import type { InteractionStep } from "@houston/protocol";
import { createInteractionOutcomes } from "../src/components/chat-interaction-reply.ts";
import {
  interactionDraftKey,
  parkedInteractionFor,
  useInteractionDraftStore,
} from "../src/stores/interaction-drafts.ts";

const SESSION = "activity-A";
const OTHER_SESSION = "activity-B";

const STEPS: InteractionStep[] = [
  { kind: "question", id: "q1", question: "Which folder?" },
  { kind: "connect", id: "c1", toolkit: "gmail" },
];

function parked(text: string) {
  return {
    key: interactionDraftKey(STEPS),
    state: {
      current: 1,
      reached: 1,
      answers: { q1: { answer: "Invoices", optionId: null } },
      drafts: { c1: text },
    },
    outcomes: createInteractionOutcomes(),
  };
}

function parkedFor(sessionKey: string, key: string) {
  return parkedInteractionFor(
    useInteractionDraftStore.getState().parked[sessionKey],
    key,
  );
}

describe("parked in-chat interactions (PRODUCT-1902)", () => {
  beforeEach(() => {
    useInteractionDraftStore.getState().reset();
  });

  it("parks a half-answered card under its own mission", () => {
    const entry = parked("half");
    useInteractionDraftStore.getState().park(SESSION, entry);

    deepStrictEqual(parkedFor(SESSION, entry.key), entry);
  });

  it("shows nothing in a different mission", () => {
    const entry = parked("half");
    useInteractionDraftStore.getState().park(SESSION, entry);

    strictEqual(parkedFor(OTHER_SESSION, entry.key), undefined);
  });

  it("hands back the very same object, so no render sees a new identity", () => {
    const entry = parked("typed but not sent");
    useInteractionDraftStore.getState().park(SESSION, entry);

    strictEqual(parkedFor(SESSION, entry.key), entry);
  });

  it("never pours one card's answers into a different card", () => {
    const entry = parked("half");
    const otherKey = interactionDraftKey([
      { kind: "question", id: "q1", question: "Which account?" },
    ]);
    useInteractionDraftStore.getState().park(SESSION, entry);

    strictEqual(parkedFor(SESSION, otherKey), undefined);
  });

  it("forgets the card outright once it is sent or dismissed", () => {
    const entry = parked("half");
    useInteractionDraftStore.getState().park(SESSION, entry);
    useInteractionDraftStore.getState().clear(SESSION);

    strictEqual(parkedFor(SESSION, entry.key), undefined);
    ok(!(SESSION in useInteractionDraftStore.getState().parked));
  });

  it("clearing a mission that parked nothing changes nothing", () => {
    const entry = parked("half");
    useInteractionDraftStore.getState().park(SESSION, entry);
    useInteractionDraftStore.getState().clear(OTHER_SESSION);

    deepStrictEqual(parkedFor(SESSION, entry.key), entry);
  });

  it("is gone after an account switch", () => {
    useInteractionDraftStore.getState().park(SESSION, parked("half"));
    useInteractionDraftStore.getState().reset();

    deepStrictEqual(useInteractionDraftStore.getState().parked, {});
  });
});

describe("interactionDraftKey", () => {
  const approval = (requestId: string, detail: string) =>
    ({
      kind: "question",
      id: "a1",
      question: "Run this?",
      detail,
      requestId,
      options: [
        { kind: "approval", id: "approve", label: "Yes" },
        { kind: "approval", id: "decline", label: "No" },
      ],
    }) satisfies InteractionStep;

  it("is the same key for the same steps", () => {
    strictEqual(interactionDraftKey(STEPS), interactionDraftKey([...STEPS]));
  });

  it("is a new key when the agent rewords a question it keeps the id of", () => {
    ok(
      interactionDraftKey(STEPS) !==
        interactionDraftKey([
          { kind: "question", id: "q1", question: "Which drive?" },
          { kind: "connect", id: "c1", toolkit: "gmail" },
        ]),
    );
  });

  it("is a new key when a second approval reuses the ids and the wording", () => {
    ok(
      interactionDraftKey([approval("r1", "rm -rf ~/photos")]) !==
        interactionDraftKey([approval("r2", "rm -rf ~/photos")]),
    );
  });

  it("is a new key when only the detail under the question changed", () => {
    ok(
      interactionDraftKey([approval("r1", "rm -rf ~/photos")]) !==
        interactionDraftKey([approval("r1", "rm -rf ~/documents")]),
    );
  });

  it("is a new key when only the options changed", () => {
    const step = approval("r1", "rm -rf ~/photos");
    ok(
      interactionDraftKey([step]) !==
        interactionDraftKey([
          {
            ...step,
            options: [{ kind: "approval", id: "approve", label: "Go" }],
          },
        ]),
    );
  });

  it("is a new key when the steps themselves change", () => {
    ok(
      interactionDraftKey(STEPS) !==
        interactionDraftKey([
          { kind: "question", id: "q2", question: "Which folder?" },
          { kind: "connect", id: "c1", toolkit: "gmail" },
        ]),
    );
    ok(interactionDraftKey(STEPS) !== interactionDraftKey([STEPS[0]]));
  });

  // The same interaction reaches the card from two sources (the live VM and
  // the persisted activity), each having built its objects its own way. Property
  // order is the one difference that must NOT split them into two cards.
  it("is the same key when a step's own properties come in a different order", () => {
    const written: InteractionStep = {
      kind: "question",
      id: "q1",
      question: "Which folder?",
      detail: "Invoices or Receipts",
    };
    const parsed: InteractionStep = {
      detail: "Invoices or Receipts",
      question: "Which folder?",
      id: "q1",
      kind: "question",
    };
    strictEqual(interactionDraftKey([written]), interactionDraftKey([parsed]));
  });

  it("is the same key when a nested option's properties come in a different order", () => {
    const written: InteractionStep = {
      kind: "question",
      id: "q1",
      question: "Which folder?",
      options: [
        { id: "inbox", label: "Inbox", recommended: true },
        { id: "archive", label: "Archive", description: "Older mail" },
      ],
    };
    const parsed: InteractionStep = {
      kind: "question",
      id: "q1",
      question: "Which folder?",
      options: [
        { recommended: true, label: "Inbox", id: "inbox" },
        { description: "Older mail", label: "Archive", id: "archive" },
      ],
    };
    strictEqual(interactionDraftKey([written]), interactionDraftKey([parsed]));
  });

  it("is the same key when the approval block's properties come in a different order", () => {
    const written: InteractionStep = {
      kind: "question",
      id: "a1",
      question: "Run this?",
      requestId: "r1",
      approval: {
        operation: "files.delete",
        args: [{ name: "path", value: "~/photos", long: false }],
      },
    };
    const parsed: InteractionStep = {
      kind: "question",
      id: "a1",
      question: "Run this?",
      requestId: "r1",
      approval: {
        args: [{ long: false, value: "~/photos", name: "path" }],
        operation: "files.delete",
      },
    };
    strictEqual(interactionDraftKey([written]), interactionDraftKey([parsed]));
  });

  it("is a new key when the approval block says a different operation", () => {
    const base: InteractionStep = {
      kind: "question",
      id: "a1",
      question: "Run this?",
      requestId: "r1",
      approval: {
        operation: "files.delete",
        args: [{ name: "path", value: "~/photos", long: false }],
      },
    };
    ok(
      interactionDraftKey([base]) !==
        interactionDraftKey([
          { ...base, approval: { operation: "files.move", args: [] } },
        ]),
    );
  });

  it("keeps the steps in the order the agent asked them", () => {
    ok(
      interactionDraftKey(STEPS) !==
        interactionDraftKey([STEPS[1], STEPS[0]] as InteractionStep[]),
    );
  });
});
