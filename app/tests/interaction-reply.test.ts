import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { ChatInteractionAnswer } from "@houston-ai/chat";
// Imported from source (not the barrel) so node's --experimental-strip-types
// runner needn't resolve the package's extensionless .tsx re-exports.
import { decodeInteractionAnswersMessage } from "../../ui/chat/src/interaction-answers-message.ts";
import { isAutoContinueMessage } from "../src/lib/auto-continue-message.ts";
import {
  composeInteractionReply,
  encodeInteractionAnswersMessage,
} from "../src/lib/interaction-reply.ts";

const answers: ChatInteractionAnswer[] = [
  { stepId: "q1", question: "To whom?", answer: "john@example.com" },
  { stepId: "q2", question: "Saying what?", answer: "Running late" },
];

/** The i18n line factories plus empty accumulators; tests spread overrides. */
const base = {
  answers: [] as ChatInteractionAnswer[],
  connectedNames: [] as string[],
  skippedConnectNames: [] as string[],
  hasQuestionSteps: false,
  signedIn: false,
  signinSkipped: false,
  connectedLine: (name: string) => `Connected ${name}.`,
  skippedConnectLine: (name: string) => `Skipped connecting ${name}.`,
  signedInLine: "Signed in to Houston.",
  skippedSigninLine: "Skipped signing in.",
  signedInFollowup: "I've signed in. Please continue.",
};

describe("composeInteractionReply", () => {
  it("sends question answers as a VISIBLE message", () => {
    const reply = composeInteractionReply({
      ...base,
      answers,
      hasQuestionSteps: true,
    });
    strictEqual(isAutoContinueMessage(reply), false);
    strictEqual(
      reply,
      "To whom?: john@example.com\nSaying what?: Running late",
    );
  });

  it("appends a Connected line per connection in a mixed sequence", () => {
    const reply = composeInteractionReply({
      ...base,
      answers,
      connectedNames: ["Gmail"],
      hasQuestionSteps: true,
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
      ...base,
      connectedNames: ["Gmail", "Slack"],
    });
    strictEqual(isAutoContinueMessage(reply), true);
    strictEqual(reply.split("\n").length, 4); // marker + blank + two lines
    strictEqual(reply.includes("Connected Gmail."), true);
    strictEqual(reply.includes("Connected Slack."), true);
  });

  it("hides a single connect-only reply too", () => {
    const reply = composeInteractionReply({
      ...base,
      connectedNames: ["Gmail"],
    });
    strictEqual(isAutoContinueMessage(reply), true);
    strictEqual(reply.endsWith("Connected Gmail."), true);
  });

  // ── Sign-in composition ────────────────────────────────────────────────
  // The signin line joins a VISIBLE reply BEFORE any Connected line when the
  // sequence also asked questions (the user typed those answers).
  it("adds the signed-in line before Connected lines in a question+signin+connect sequence", () => {
    const reply = composeInteractionReply({
      ...base,
      answers,
      connectedNames: ["Gmail"],
      hasQuestionSteps: true,
      signedIn: true,
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
      ...base,
      connectedNames: ["Gmail"],
      signedIn: true,
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
    const reply = composeInteractionReply({ ...base, signedIn: true });
    strictEqual(isAutoContinueMessage(reply), true);
    strictEqual(reply.endsWith("I've signed in. Please continue."), true);
    strictEqual(reply.includes("Signed in to Houston."), false);
  });

  // ── Skip composition ───────────────────────────────────────────────────
  // A skipped connect step is a fact the agent MUST hear (or it re-requests the
  // same app forever): it joins the visible reply after the Connected lines.
  it("appends a Skipped line per skipped connect step in a mixed sequence", () => {
    const reply = composeInteractionReply({
      ...base,
      answers,
      connectedNames: ["Gmail"],
      skippedConnectNames: ["Slack"],
      hasQuestionSteps: true,
    });
    strictEqual(isAutoContinueMessage(reply), false);
    strictEqual(
      reply,
      "To whom?: john@example.com\nSaying what?: Running late\nConnected Gmail.\nSkipped connecting Slack.",
    );
  });

  // A fully-skipped connect-only sequence still resumes the agent (hidden),
  // telling it the user declined — never a silent dead end.
  it("hides a skipped connect-only sequence but names the declined app", () => {
    const reply = composeInteractionReply({
      ...base,
      skippedConnectNames: ["Gmail"],
    });
    strictEqual(isAutoContinueMessage(reply), true);
    strictEqual(reply.endsWith("Skipped connecting Gmail."), true);
  });

  // A skipped sign-in is NOT a sign-in: the followup shortcut must not fire,
  // and the skip line rides the hidden resume instead.
  it("resumes a skipped signin-only sequence with the skip line, not the followup", () => {
    const reply = composeInteractionReply({ ...base, signinSkipped: true });
    strictEqual(isAutoContinueMessage(reply), true);
    strictEqual(reply.endsWith("Skipped signing in."), true);
    strictEqual(reply.includes("I've signed in."), false);
  });

  // Signed in for real, then skipped the connect: the followup shortcut is for
  // a signin-ONLY sequence — a skipped connect is a fact that must survive.
  it("keeps the skip line when a signin succeeded but the connect was skipped", () => {
    const reply = composeInteractionReply({
      ...base,
      signedIn: true,
      skippedConnectNames: ["Gmail"],
    });
    strictEqual(isAutoContinueMessage(reply), true);
    strictEqual(reply.includes("Signed in to Houston."), true);
    strictEqual(reply.includes("Skipped connecting Gmail."), true);
    strictEqual(reply.includes("I've signed in. Please continue."), false);
  });
});

describe("encodeInteractionAnswersMessage", () => {
  it("keeps the flat model body identical to composeInteractionReply", () => {
    const shared = {
      ...base,
      answers,
      connectedNames: ["Gmail"],
      hasQuestionSteps: true,
      signedIn: true,
    };
    const encoded = encodeInteractionAnswersMessage(shared);
    const flat = composeInteractionReply(shared);
    // The marker rides in front; the body after the blank line is the untouched
    // flat reply the model reads.
    strictEqual(encoded.endsWith(`\n\n${flat}`), true);
    strictEqual(encoded.startsWith("<!--houston:interaction-answers "), true);
  });

  it("carries a structured payload that decodes back to the same Q&A", () => {
    const encoded = encodeInteractionAnswersMessage({
      ...base,
      answers,
      connectedNames: ["Gmail"],
      skippedConnectNames: ["Slack"],
      hasQuestionSteps: true,
      signedIn: true,
    });
    const payload = decodeInteractionAnswersMessage(encoded);
    deepStrictEqual(payload, {
      lines: [
        { question: "To whom?", answer: "john@example.com" },
        { question: "Saying what?", answer: "Running late" },
        { answer: "Signed in to Houston." },
        { answer: "Connected Gmail." },
        { answer: "Skipped connecting Slack." },
      ],
    });
  });

  it("does NOT mark a hidden connect-only sequence (no visible bubble)", () => {
    const encoded = encodeInteractionAnswersMessage({
      ...base,
      connectedNames: ["Gmail"],
    });
    strictEqual(isAutoContinueMessage(encoded), true);
    strictEqual(decodeInteractionAnswersMessage(encoded), null);
  });

  it("does NOT mark a hidden signin-only sequence", () => {
    const encoded = encodeInteractionAnswersMessage({
      ...base,
      signedIn: true,
    });
    strictEqual(isAutoContinueMessage(encoded), true);
    strictEqual(decodeInteractionAnswersMessage(encoded), null);
  });
});
