import { deepStrictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { ChatInteractionAnswer } from "@houston-ai/chat";
import { encodeInteractionAnswersMessage } from "../src/lib/interaction-answers-marker.ts";
import {
  type ApprovalCardStep,
  approvalsFromAnswers,
} from "../src/lib/interaction-approvals.ts";

/**
 * A3 / A4 from the app's side: a person's click on an approval CONTROL becomes a
 * receipt bound to the host's request id, and anything short of that click -
 * typed prose, an ordinary option that happens to be called "approve" - becomes
 * nothing at all. The control is structural (`kind: "approval"` + an id); its
 * wording is the app's own locale and carries no meaning here.
 */

const options: ApprovalCardStep["options"] = [
  { id: "approve", kind: "approval" },
  { id: "decline", kind: "approval" },
];

const card = (id: string, requestId: string): ApprovalCardStep => ({
  id,
  requestId,
  options,
});

/** A control the person clicked, with the wording their locale showed them. */
const clicked = (
  stepId: string,
  optionId: string,
  text: string,
): ChatInteractionAnswer => ({
  stepId,
  question: "Delete it?",
  answer: text,
  source: "option",
  optionId,
});

/** Words the person typed into the composer, whatever they happen to say. */
const typed = (stepId: string, text: string): ChatInteractionAnswer => ({
  stepId,
  question: "Delete it?",
  answer: text,
  source: "text",
});

describe("approvalsFromAnswers", () => {
  it("turns a clicked approval into a receipt for that card's request", () => {
    deepStrictEqual(
      approvalsFromAnswers(
        [card("x1", "req-1")],
        [clicked("x1", "approve", "Yes, go ahead")],
      ),
      [{ requestId: "req-1", decision: "approve" }],
    );
  });

  it("turns a decline into a denial the agent must hear", () => {
    deepStrictEqual(
      approvalsFromAnswers(
        [card("x1", "req-1")],
        [clicked("x1", "decline", "No, don't do it")],
      ),
      [{ requestId: "req-1", decision: "deny" }],
    );
  });

  it("answers two cards separately, so one click never decides both", () => {
    deepStrictEqual(
      approvalsFromAnswers(
        [card("x1", "req-1"), card("x2", "req-2")],
        [
          clicked("x1", "approve", "Yes, go ahead"),
          clicked("x2", "decline", "No, don't do it"),
        ],
      ),
      [
        { requestId: "req-1", decision: "approve" },
        { requestId: "req-2", decision: "deny" },
      ],
    );
  });

  it("typed text is not an approval, so it yields no receipt at all", () => {
    deepStrictEqual(
      approvalsFromAnswers(
        [card("x1", "req-1")],
        [typed("x1", "wait, what does that mean?")],
      ),
      [],
    );
  });

  it("typing the control's own wording still yields no receipt", () => {
    deepStrictEqual(
      approvalsFromAnswers(
        [card("x1", "req-1")],
        [typed("x1", "Yes, go ahead")],
      ),
      [],
    );
  });

  it("an ordinary option named approve decides nothing", () => {
    deepStrictEqual(
      approvalsFromAnswers(
        [{ id: "x1", requestId: "req-1", options: [{ id: "approve" }] }],
        [clicked("x1", "approve", "Yes, go ahead")],
      ),
      [],
    );
  });

  it("an ordinary question step carries no request, so it decides nothing", () => {
    deepStrictEqual(
      approvalsFromAnswers(
        [{ id: "q1", options }],
        [clicked("q1", "approve", "Yes, go ahead")],
      ),
      [],
    );
  });
});

describe("a composed reply that answered an approval card", () => {
  const base = {
    connectedNames: [],
    skippedConnectNames: [],
    credentialedNames: [],
    skippedCredentialNames: [],
    connectRedirects: [],
    credentialRedirects: [],
    hasQuestionSteps: true,
    signedIn: false,
    signinSkipped: false,
    connectedLine: (n: string) => n,
    skippedConnectLine: (n: string) => n,
    credentialedLine: (n: string) => n,
    skippedCredentialLine: (n: string) => n,
    signedInLine: "",
    skippedSigninLine: "",
    signedInFollowup: "",
    connectRedirectLine: (n: string) => n,
    credentialRedirectLine: (n: string) => n,
    signinRedirectLine: (t: string) => t,
    credentialedFollowup: "",
  };

  it("leaves the reply body untouched: receipts ride their own field, never the text", () => {
    const text = encodeInteractionAnswersMessage({
      ...base,
      answers: [clicked("x1", "approve", "Yes, go ahead")],
    });
    // The person's words are the person's words. Nothing about an approval is
    // hidden inside them - the host reads the receipts off the request itself.
    deepStrictEqual(text.endsWith("Delete it?: Yes, go ahead"), true);
    deepStrictEqual(text.includes("houston:approval"), false);
  });
});
