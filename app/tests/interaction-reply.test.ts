import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { ChatInteractionAnswer } from "@houston-ai/chat";
import { isAutoContinueMessage } from "../src/lib/auto-continue-message.ts";
import { composeInteractionReply } from "../src/lib/interaction-reply.ts";

const connectedLine = (name: string) => `Connected ${name}.`;

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
      connectedLine,
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
      connectedLine,
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
      connectedLine,
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
      connectedLine,
    });
    strictEqual(isAutoContinueMessage(reply), true);
    strictEqual(reply.endsWith("Connected Gmail."), true);
  });
});
