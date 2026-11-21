import { equal } from "node:assert";
import { describe, it } from "node:test";
import {
  type ChatDisplayItem,
  shouldShowThinkingIndicator,
} from "../src/chat-process-groups.ts";
import type { ChatMessage } from "../src/feed-to-messages.ts";

function message(from: ChatMessage["from"]): ChatDisplayItem {
  return {
    kind: "message",
    sourceIndex: 0,
    message: {
      key: "m",
      from,
      content: "",
      isStreaming: false,
      tools: [],
      fileChanges: [],
    },
  };
}

function process(isActive: boolean): ChatDisplayItem {
  return {
    kind: "process",
    key: "p",
    segments: [],
    isActive,
    isTrailing: true,
    sourceIndex: 0,
    offersOnly: false,
  };
}

describe("shouldShowThinkingIndicator (HOU-471)", () => {
  it("hides the indicator when the turn is settled", () => {
    equal(shouldShowThinkingIndicator([message("assistant")], "ready"), false);
  });

  it("hides the indicator while the answer streams (the text is the signal)", () => {
    equal(
      shouldShowThinkingIndicator([message("assistant")], "streaming"),
      false,
    );
  });

  it("shows the indicator in the gap after sending, before any output", () => {
    equal(shouldShowThinkingIndicator([message("user")], "submitted"), true);
  });

  it("shows the indicator on a brand-new chat with no items yet", () => {
    equal(shouldShowThinkingIndicator([], "submitted"), true);
  });

  it("suppresses the indicator while an active process block surfaces progress", () => {
    equal(
      shouldShowThinkingIndicator(
        [message("user"), process(true)],
        "submitted",
      ),
      false,
    );
  });

  it("shows the indicator again once the trailing process block has settled", () => {
    equal(shouldShowThinkingIndicator([process(false)], "submitted"), true);
  });
});

describe("a host card that shows its own progress", () => {
  const card = (ownsProgress?: boolean): ChatDisplayItem => ({
    kind: "message",
    sourceIndex: 0,
    message: {
      key: "host-card-c1",
      from: "system",
      content: "",
      isStreaming: false,
      tools: [],
      fileChanges: [],
      hostCard: {
        kind: "goal",
        payload: null,
        ...(ownsProgress ? { ownsProgress } : {}),
      },
    },
  });

  it("stands in for the thinking line while it trails the turn", () => {
    equal(shouldShowThinkingIndicator([card(true)], "submitted"), false);
  });

  it("leaves the thinking line to a card that does not", () => {
    equal(shouldShowThinkingIndicator([card()], "submitted"), true);
  });

  it("keeps it with a finished reply placed under the card", () => {
    const under = [card(true), message("assistant")];
    equal(shouldShowThinkingIndicator(under, "submitted"), false);
    equal(
      shouldShowThinkingIndicator([card(), message("assistant")], "submitted"),
      true,
    );
  });

  it("gives it up once the person writes after the card", () => {
    const after = [card(true), message("assistant"), message("user")];
    equal(shouldShowThinkingIndicator(after, "submitted"), true);
  });
});
