import { deepStrictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { ChatInteractionAnswer } from "@houston-ai/chat";
import { encodeInteractionAnswersMessage } from "../src/lib/interaction-answers-marker.ts";
import {
  type ApprovalCardStep,
  approvalsFromAnswers,
} from "../src/lib/interaction-approvals.ts";

/**
 * A3 / A4 from the app's side: a person's click on an approval card becomes a
 * receipt bound to the host's request id, and anything short of a click becomes
 * nothing at all.
 */

const options = [
  { id: "approve", label: "Yes, go ahead" },
  { id: "decline", label: "No, don't do it" },
];

const card = (id: string, requestId: string): ApprovalCardStep => ({
  id,
  requestId,
  options,
});

const answer = (stepId: string, text: string): ChatInteractionAnswer => ({
  stepId,
  question: "Delete it?",
  answer: text,
});

describe("approvalsFromAnswers", () => {
  it("turns a clicked approval into a receipt for that card's request", () => {
    deepStrictEqual(
      approvalsFromAnswers(
        [card("x1", "req-1")],
        [answer("x1", "Yes, go ahead")],
      ),
      [{ requestId: "req-1", decision: "approve" }],
    );
  });

  it("turns a decline into a denial the agent must hear", () => {
    deepStrictEqual(
      approvalsFromAnswers(
        [card("x1", "req-1")],
        [answer("x1", "No, don't do it")],
      ),
      [{ requestId: "req-1", decision: "deny" }],
    );
  });

  it("answers two cards separately, so one click never decides both", () => {
    deepStrictEqual(
      approvalsFromAnswers(
        [card("x1", "req-1"), card("x2", "req-2")],
        [answer("x1", "Yes, go ahead"), answer("x2", "No, don't do it")],
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
        [answer("x1", "wait, what does that mean?")],
      ),
      [],
    );
  });

  it("an ordinary question step carries no request, so it decides nothing", () => {
    deepStrictEqual(
      approvalsFromAnswers(
        [{ id: "q1", options }],
        [answer("q1", "Yes, go ahead")],
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
      answers: [answer("x1", "Yes, go ahead")],
    });
    // The person's words are the person's words. Nothing about an approval is
    // hidden inside them - the host reads the receipts off the request itself.
    deepStrictEqual(text.endsWith("Delete it?: Yes, go ahead"), true);
    deepStrictEqual(text.includes("houston:approval"), false);
  });
});
