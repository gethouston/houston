import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { PendingInteraction } from "@houston/protocol";
import {
  completionInteractionReady,
  deriveActiveInteraction,
  interactionNotificationBodyKey,
} from "../src/lib/active-interaction.ts";

const question: PendingInteraction = {
  kind: "question",
  questions: [
    {
      id: "q1",
      question: "Which account?",
      options: [{ id: "a", label: "Work" }],
    },
  ],
};
const connect: PendingInteraction = { kind: "connect", toolkit: "gmail" };

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

  it("maps a pending connect to the connect body", () => {
    strictEqual(
      interactionNotificationBodyKey(connect),
      "sessionComplete.connect",
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
