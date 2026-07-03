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
    // Just the user's message on the feed, waiting on the first token.
    equal(shouldShowThinkingIndicator([message("user")], "submitted"), true);
  });

  it("shows the indicator on a brand-new chat with no items yet", () => {
    equal(shouldShowThinkingIndicator([], "submitted"), true);
  });

  it("suppresses the indicator while an active process block surfaces progress", () => {
    // The mission-log header already reads "Mission in progress: <action>", so
    // a second standalone line would duplicate it.
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
