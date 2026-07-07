import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { PendingInteraction } from "@houston/protocol";
import {
  completionInteractionReady,
  deriveActiveInteraction,
  interactionNotificationBodyKey,
  interactionQuestionCount,
} from "../src/lib/active-interaction.ts";

const question: PendingInteraction = {
  steps: [
    {
      kind: "question",
      id: "q1",
      question: "Which account?",
      options: [{ id: "a", label: "Work" }],
    },
  ],
};
const connect: PendingInteraction = {
  steps: [{ kind: "connect", id: "c1", toolkit: "gmail" }],
};
const mixed: PendingInteraction = {
  steps: [
    { kind: "question", id: "q1", question: "To whom?" },
    { kind: "question", id: "q2", question: "Saying what?" },
    { kind: "connect", id: "c1", toolkit: "gmail" },
  ],
};

describe("deriveActiveInteraction", () => {
  it("hides the override while a turn is running", () => {
    strictEqual(
      deriveActiveInteraction({
        running: true,
        live: question,
        persisted: connect,
      }),
      null,
    );
  });

  it("prefers the live VM interaction over the persisted one", () => {
    strictEqual(
      deriveActiveInteraction({
        running: false,
        live: question,
        persisted: connect,
      }),
      question,
    );
  });

  it("falls back to the persisted interaction on reload (no live)", () => {
    strictEqual(
      deriveActiveInteraction({
        running: false,
        live: null,
        persisted: connect,
      }),
      connect,
    );
  });

  it("is null when nothing is pending", () => {
    strictEqual(
      deriveActiveInteraction({
        running: false,
        live: null,
        persisted: undefined,
      }),
      null,
    );
  });
});

describe("interactionNotificationBodyKey", () => {
  it("maps a pending question to the question body", () => {
    strictEqual(
      interactionNotificationBodyKey(question),
      "sessionComplete.question",
    );
  });

  it("maps a connect-only sequence to the connect body", () => {
    strictEqual(
      interactionNotificationBodyKey(connect),
      "sessionComplete.connect",
    );
  });

  it("maps a mixed sequence (has questions) to the question body", () => {
    strictEqual(
      interactionNotificationBodyKey(mixed),
      "sessionComplete.question",
    );
  });

  it("maps a clean finish (no interaction) to the plain body", () => {
    strictEqual(interactionNotificationBodyKey(null), "sessionComplete.body");
    strictEqual(
      interactionNotificationBodyKey(undefined),
      "sessionComplete.body",
    );
  });
});

describe("interactionQuestionCount", () => {
  it("counts the question steps, ignoring connect steps", () => {
    strictEqual(interactionQuestionCount(question), 1);
    strictEqual(interactionQuestionCount(mixed), 2);
    strictEqual(interactionQuestionCount(connect), 0);
  });

  it("is 0 with no pending interaction", () => {
    strictEqual(interactionQuestionCount(null), 0);
    strictEqual(interactionQuestionCount(undefined), 0);
  });
});

describe("completionInteractionReady", () => {
  it("is not ready while the turn is still running (fold pending)", () => {
    strictEqual(completionInteractionReady("running"), false);
  });

  it("is not ready when no board card has folded", () => {
    strictEqual(completionInteractionReady(null), false);
    strictEqual(completionInteractionReady(undefined), false);
  });

  it("is ready once the terminal board persist folded", () => {
    strictEqual(completionInteractionReady("done"), true);
    strictEqual(completionInteractionReady("needs_you"), true);
    strictEqual(completionInteractionReady("error"), true);
  });
});
