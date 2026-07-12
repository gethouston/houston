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
const signin: PendingInteraction = {
  steps: [{ kind: "signin", id: "s1", reason: "Sign in to keep going." }],
};
const credential: PendingInteraction = {
  steps: [{ kind: "credential", id: "k1", toolkit: "acme" }],
};
const signinConnect: PendingInteraction = {
  steps: [
    { kind: "signin", id: "s1" },
    { kind: "connect", id: "c1", toolkit: "gmail" },
  ],
};
const questionSignin: PendingInteraction = {
  steps: [
    { kind: "question", id: "q1", question: "Which account?" },
    { kind: "signin", id: "s1" },
  ],
};
const approval: PendingInteraction = {
  steps: [
    {
      kind: "approval",
      id: "a1",
      toolkit: "gmail",
      action: "GMAIL_SEND_EMAIL",
      paramsHash: "0123456789abcdef",
    },
  ],
};
const connectApproval: PendingInteraction = {
  steps: [
    { kind: "connect", id: "c1", toolkit: "gmail" },
    {
      kind: "approval",
      id: "a1",
      toolkit: "gmail",
      action: "GMAIL_SEND_EMAIL",
      paramsHash: "0123456789abcdef",
    },
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

// Interactions persisted by OLDER builds (pre-step shapes without `steps`)
// outlive the code that wrote them. They must read as "nothing pending",
// never crash (`undefined is not an object (evaluating 'steps.some')`).
const legacyQuestion = {
  kind: "question",
  question: "Which account?",
  options: [{ id: "a", label: "Work" }],
} as unknown as PendingInteraction;
const legacyConnect = {
  kind: "connect",
  toolkit: "gmail",
} as unknown as PendingInteraction;

describe("legacy persisted shapes (no steps)", () => {
  it("deriveActiveInteraction treats them as absent, both sources", () => {
    strictEqual(
      deriveActiveInteraction({
        running: false,
        live: legacyQuestion,
        persisted: legacyConnect,
      }),
      null,
    );
  });

  it("falls through an invalid live value to a valid persisted one", () => {
    strictEqual(
      deriveActiveInteraction({
        running: false,
        live: legacyQuestion,
        persisted: connect,
      }),
      connect,
    );
  });

  it("notification body falls back to the plain body without throwing", () => {
    strictEqual(
      interactionNotificationBodyKey(legacyQuestion),
      "sessionComplete.body",
    );
    strictEqual(
      interactionNotificationBodyKey(legacyConnect),
      "sessionComplete.body",
    );
  });

  it("question count is 0 without throwing", () => {
    strictEqual(interactionQuestionCount(legacyQuestion), 0);
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

  it("maps a signin-only sequence to the signin body", () => {
    strictEqual(
      interactionNotificationBodyKey(signin),
      "sessionComplete.signin",
    );
  });

  it("maps a credential-only sequence to the credential body", () => {
    strictEqual(
      interactionNotificationBodyKey(credential),
      "sessionComplete.credential",
    );
  });

  // Steps are ordered questions -> sign-in -> connections, so a signin+connect
  // sequence's FIRST unmet need is the sign-in.
  it("maps a signin+connect sequence to the signin body (sign-in first)", () => {
    strictEqual(
      interactionNotificationBodyKey(signinConnect),
      "sessionComplete.signin",
    );
  });

  // Questions still win: a sequence that also has questions reads as the
  // question body even when a sign-in is queued after them.
  it("maps a question+signin sequence to the question body", () => {
    strictEqual(
      interactionNotificationBodyKey(questionSignin),
      "sessionComplete.question",
    );
  });

  it("maps a mixed sequence (has questions) to the question body", () => {
    strictEqual(
      interactionNotificationBodyKey(mixed),
      "sessionComplete.question",
    );
  });

  it("maps an approval-only sequence to the approval body", () => {
    strictEqual(
      interactionNotificationBodyKey(approval),
      "sessionComplete.approval",
    );
  });

  // Steps are ordered connections -> approvals, so a connect+approval sequence's
  // FIRST unmet need is the connect.
  it("maps a connect+approval sequence to the connect body (connect first)", () => {
    strictEqual(
      interactionNotificationBodyKey(connectApproval),
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

describe("interactionQuestionCount", () => {
  it("counts the question steps, ignoring connect + signin steps", () => {
    strictEqual(interactionQuestionCount(question), 1);
    strictEqual(interactionQuestionCount(mixed), 2);
    strictEqual(interactionQuestionCount(connect), 0);
    strictEqual(interactionQuestionCount(signin), 0);
    strictEqual(interactionQuestionCount(questionSignin), 1);
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
