import { deepStrictEqual, strictEqual } from "node:assert";
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
const offers: PendingInteraction = {
  steps: [
    {
      kind: "suggest_actions",
      id: "a1",
      actions: [
        { id: "x", label: "Send it", message: "Send the deck" },
        { id: "y", label: "Draft a note", message: "Draft the note" },
      ],
    },
    {
      kind: "suggest_reusable",
      id: "r1",
      reusableKind: "skill",
      title: "Weekly deck",
      rationale: "You do this every week.",
    },
  ],
};
const questionPlusOffers: PendingInteraction = {
  steps: [
    { kind: "question", id: "q1", question: "Which deck?" },
    ...offers.steps,
  ],
};
const brandedQuestion: PendingInteraction = {
  steps: [
    {
      kind: "question",
      id: "q1",
      question: "Should I send the draft?",
      toolkit: "gmail",
    },
  ],
};
const connectQuestion: PendingInteraction = {
  steps: [
    { kind: "connect", id: "c1", toolkit: "gmail" },
    {
      kind: "question",
      id: "q1",
      question: "Should I send the draft?",
      toolkit: "gmail",
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
        missionStatus: "needs_you",
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
        missionStatus: "needs_you",
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
        missionStatus: "needs_you",
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
        missionStatus: "needs_you",
      }),
      null,
    );
  });
});

describe("deriveActiveInteraction on a mission the user moved to done", () => {
  it("drops the LIVE blocking interaction (the regression: reopening a Done card re-asked the question)", () => {
    strictEqual(
      deriveActiveInteraction({
        running: false,
        live: question,
        persisted: undefined,
        missionStatus: "done",
      }),
      null,
    );
  });

  it("keeps the clean-finish offers of a mixed live interaction, dropping the question", () => {
    deepStrictEqual(
      deriveActiveInteraction({
        running: false,
        live: questionPlusOffers,
        persisted: undefined,
        missionStatus: "done",
      }),
      offers,
    );
  });

  it("returns the SAME reference when there is nothing to strip", () => {
    strictEqual(
      deriveActiveInteraction({
        running: false,
        live: offers,
        persisted: undefined,
        missionStatus: "done",
      }),
      offers,
    );
  });

  it("returns the SAME stripped object for the same source interaction", () => {
    const args = {
      running: false,
      live: questionPlusOffers,
      missionStatus: "done",
    };
    strictEqual(
      deriveActiveInteraction({ ...args, persisted: undefined }),
      deriveActiveInteraction({ ...args, persisted: offers }),
    );
  });

  it("strips the persisted interaction too (the reload path agrees)", () => {
    strictEqual(
      deriveActiveInteraction({
        running: false,
        live: null,
        persisted: mixed,
        missionStatus: "done",
      }),
      null,
    );
  });

  it("leaves every other status untouched", () => {
    for (const missionStatus of [
      "needs_you",
      "error",
      "running",
      "archived",
      "something_new",
      null,
      undefined,
    ]) {
      strictEqual(
        deriveActiveInteraction({
          running: false,
          live: question,
          persisted: undefined,
          missionStatus,
        }),
        question,
        `status ${missionStatus} must not strip`,
      );
    }
  });
});

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
        missionStatus: "needs_you",
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
        missionStatus: "needs_you",
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

  it("maps a signin+connect sequence to the signin body (sign-in first)", () => {
    strictEqual(
      interactionNotificationBodyKey(signinConnect),
      "sessionComplete.signin",
    );
  });

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

  it("maps a branded confirmation question to the question body", () => {
    strictEqual(
      interactionNotificationBodyKey(brandedQuestion),
      "sessionComplete.question",
    );
  });

  it("maps a connect+question sequence to the question body", () => {
    strictEqual(
      interactionNotificationBodyKey(connectQuestion),
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
