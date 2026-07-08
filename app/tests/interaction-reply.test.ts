import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { ChatInteractionAnswer } from "@houston-ai/chat";
import { isAutoContinueMessage } from "../src/lib/auto-continue-message.ts";
import { composeInteractionReply } from "../src/lib/interaction-reply.ts";

const connectedLine = (name: string) => `Connected ${name}.`;
const signedInLine = "Signed in to Houston.";
const signedInFollowup = "I've signed in. Please continue.";

const answers: ChatInteractionAnswer[] = [
  { stepId: "q1", question: "To whom?", answer: "john@example.com" },
  { stepId: "q2", question: "Saying what?", answer: "Running late" },
];

describe("composeInteractionReply", () => {
  it("sends question answers as a VISIBLE message", () => {
    const reply = composeInteractionReply({
      answers,
      connectedNames: [],
      hasQuestionSteps: true,
      signedIn: false,
      connectedLine,
      signedInLine,
      signedInFollowup,
    });
    strictEqual(isAutoContinueMessage(reply), false);
    strictEqual(
      reply,
      "To whom?: john@example.com\nSaying what?: Running late",
    );
  });

  it("appends a Connected line per connection in a mixed sequence", () => {
    const reply = composeInteractionReply({
      answers,
      connectedNames: ["Gmail"],
      hasQuestionSteps: true,
      signedIn: false,
      connectedLine,
      signedInLine,
      signedInFollowup,
    });
    strictEqual(isAutoContinueMessage(reply), false);
    strictEqual(
      reply,
      "To whom?: john@example.com\nSaying what?: Running late\nConnected Gmail.",
    );
  });

  // The claim this locks: a connect-only sequence must NOT resume the agent
  // per-connect (which tore the card down mid-sequence). It walks EVERY connect
  // step, then sends ONE hidden auto-continue message naming all of them.
  it("names every connection in ONE hidden message for a connect-only sequence", () => {
    const reply = composeInteractionReply({
      answers: [],
      connectedNames: ["Gmail", "Slack"],
      hasQuestionSteps: false,
      signedIn: false,
      connectedLine,
      signedInLine,
      signedInFollowup,
    });
    strictEqual(isAutoContinueMessage(reply), true);
    strictEqual(reply.split("\n").length, 4); // marker + blank + two lines
    strictEqual(reply.includes("Connected Gmail."), true);
    strictEqual(reply.includes("Connected Slack."), true);
  });

  it("hides a single connect-only reply too", () => {
    const reply = composeInteractionReply({
      answers: [],
      connectedNames: ["Gmail"],
      hasQuestionSteps: false,
      signedIn: false,
      connectedLine,
      signedInLine,
      signedInFollowup,
    });
    strictEqual(isAutoContinueMessage(reply), true);
    strictEqual(reply.endsWith("Connected Gmail."), true);
  });

  // ── Sign-in composition ────────────────────────────────────────────────
  // The signin line joins a VISIBLE reply BEFORE any Connected line when the
  // sequence also asked questions (the user typed those answers).
  it("adds the signed-in line before Connected lines in a question+signin+connect sequence", () => {
    const reply = composeInteractionReply({
      answers,
      connectedNames: ["Gmail"],
      hasQuestionSteps: true,
      signedIn: true,
      connectedLine,
      signedInLine,
      signedInFollowup,
    });
    strictEqual(isAutoContinueMessage(reply), false);
    strictEqual(
      reply,
      "To whom?: john@example.com\nSaying what?: Running late\nSigned in to Houston.\nConnected Gmail.",
    );
  });

  // A signin+connect sequence with no questions has nothing the user typed, so
  // it resumes the agent hidden — the signed-in status line before the connects.
  it("hides a signin+connect sequence and orders sign-in before connects", () => {
    const reply = composeInteractionReply({
      answers: [],
      connectedNames: ["Gmail"],
      hasQuestionSteps: false,
      signedIn: true,
      connectedLine,
      signedInLine,
      signedInFollowup,
    });
    strictEqual(isAutoContinueMessage(reply), true);
    strictEqual(reply.includes("Signed in to Houston."), true);
    strictEqual(
      reply.indexOf("Signed in to Houston.") <
        reply.indexOf("Connected Gmail."),
      true,
    );
  });

  // A signin-ONLY sequence has nothing factual to relay, so it uses the
  // dedicated hidden followup, never a lone status line.
  it("resumes a signin-only sequence with the hidden followup", () => {
    const reply = composeInteractionReply({
      answers: [],
      connectedNames: [],
      hasQuestionSteps: false,
      signedIn: true,
      connectedLine,
      signedInLine,
      signedInFollowup,
    });
    strictEqual(isAutoContinueMessage(reply), true);
    strictEqual(reply.endsWith("I've signed in. Please continue."), true);
    strictEqual(reply.includes("Signed in to Houston."), false);
  });
});
