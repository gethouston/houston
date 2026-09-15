import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { ChatInteractionAnswer } from "@houston-ai/chat";
import {
  createInteractionOutcomes,
  hasQuestionStep,
  type InteractionT,
  interactionReplyMessage,
} from "../src/components/chat-interaction-reply.ts";
import { isAutoContinueMessage } from "../src/lib/auto-continue-message.ts";
import type { NonPlanReadyStep } from "../src/lib/plan-ready.ts";

/** Echoes the key and its interpolations, so a test asserts WHICH line each
 *  outcome composed and in WHAT order — not the English wording. */
const t = ((key: string, vars?: Record<string, unknown>) =>
  vars === undefined
    ? key
    : `${key}(${Object.entries(vars)
        .map(([k, v]) => `${k}=${String(v)}`)
        .join(",")})`) as unknown as InteractionT;

/** The flat body the agent reads: both the structured-answers marker and the
 *  auto-continue marker are leading HTML comments the model ignores. */
function bodyLines(message: string): string[] {
  return message
    .replace(/<!--[\s\S]*?-->/g, "")
    .trim()
    .split("\n");
}

const steps: NonPlanReadyStep[] = [
  { kind: "provider_connect", id: "p1", provider: "anthropic" },
  { kind: "connect", id: "c1", toolkit: "gmail" },
  { kind: "credential", id: "k1", toolkit: "stripe" },
];

const answers: ChatInteractionAnswer[] = [
  { stepId: "q1", question: "To whom?", answer: "john@example.com" },
];

describe("interactionReplyMessage", () => {
  it("names every step's FINAL outcome, in the composer's clause order", () => {
    const outcomes = createInteractionOutcomes();
    outcomes.connects.set("p1", { name: "Claude", connected: true });
    // A decline WITH text is a redirection, not a bare skip.
    outcomes.connects.set("c1", {
      name: "Gmail",
      connected: false,
      message: "Use Sheets instead",
    });
    outcomes.credentials.set("k1", { name: "Stripe", saved: true });
    outcomes.signin = "signedIn";

    const message = interactionReplyMessage({
      steps,
      answers,
      outcomes,
      hasQuestionSteps: true,
      t,
    });

    deepStrictEqual(bodyLines(message), [
      "To whom?: john@example.com",
      "chat:interaction.signedInLine",
      "chat:interaction.connectedLine(name=Claude)",
      "chat:interaction.connectRedirectLine(name=Gmail,text=Use Sheets instead)",
      "chat:credential.savedLine(name=Stripe)",
    ]);
  });

  it("reports a plain decline as a skip the agent must hear", () => {
    const outcomes = createInteractionOutcomes();
    outcomes.connects.set("p1", { name: "Claude", connected: false });
    outcomes.connects.set("c1", { name: "Gmail", connected: false });
    outcomes.signin = "skipped";
    outcomes.signinDeclineText = "Stay signed out";

    deepStrictEqual(
      bodyLines(
        interactionReplyMessage({
          steps,
          answers: [],
          outcomes,
          hasQuestionSteps: false,
          t,
        }),
      ),
      [
        "chat:interaction.skippedSigninLine",
        "chat:interaction.signinRedirectLine(text=Stay signed out)",
        "chat:interaction.skippedConnectLine(name=Claude)",
        "chat:interaction.skippedConnectLine(name=Gmail)",
      ],
    );
  });

  it("speaks the sign-in wording for an oauth credential, the key wording otherwise", () => {
    const oauth = createInteractionOutcomes();
    oauth.credentials.set("k1", { name: "Stripe", saved: true });
    oauth.credentialModes.set("Stripe", "oauth");
    // Credential-only and all saved → the hidden followup, not a status line.
    const message = interactionReplyMessage({
      steps: [steps[2] as NonPlanReadyStep],
      answers: [],
      outcomes: oauth,
      hasQuestionSteps: false,
      t,
    });
    strictEqual(isAutoContinueMessage(message), true);
    deepStrictEqual(bodyLines(message), [
      "chat:credential.signedInFollowup(name=Stripe)",
    ]);

    const skipped = createInteractionOutcomes();
    skipped.credentials.set("k1", { name: "Stripe", saved: false });
    skipped.credentialModes.set("Stripe", "oauth");
    deepStrictEqual(
      bodyLines(
        interactionReplyMessage({
          steps: [steps[2] as NonPlanReadyStep],
          answers: [],
          outcomes: skipped,
          hasQuestionSteps: false,
          t,
        }),
      ),
      ["chat:credential.skippedSignInLine(name=Stripe)"],
    );
  });

  it("hides a sequence the user typed nothing into", () => {
    const outcomes = createInteractionOutcomes();
    outcomes.connects.set("p1", { name: "Claude", connected: true });
    const hidden = interactionReplyMessage({
      steps,
      answers: [],
      outcomes,
      hasQuestionSteps: false,
      t,
    });
    // No user bubble for a connect the user never narrated.
    strictEqual(isAutoContinueMessage(hidden), true);

    const visible = interactionReplyMessage({
      steps,
      answers,
      outcomes,
      hasQuestionSteps: true,
      t,
    });
    strictEqual(isAutoContinueMessage(visible), false);
  });

  it("says nothing about a step nobody walked", () => {
    deepStrictEqual(
      bodyLines(
        interactionReplyMessage({
          steps,
          answers,
          outcomes: createInteractionOutcomes(),
          hasQuestionSteps: true,
          t,
        }),
      ),
      ["To whom?: john@example.com"],
    );
  });
});

describe("hasQuestionStep", () => {
  it("is true only when a mapped step actually asks something", () => {
    strictEqual(
      hasQuestionStep([{ kind: "custom", id: "p1", title: "Claude" }]),
      false,
    );
    strictEqual(
      hasQuestionStep([
        { kind: "custom", id: "p1", title: "Claude" },
        { kind: "question", id: "q1", question: "To whom?" },
      ]),
      true,
    );
  });
});
