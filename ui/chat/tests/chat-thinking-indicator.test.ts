import { equal } from "node:assert";
import { describe, it } from "node:test";
import {
  shouldShowThinkingIndicator,
  type ChatDisplayItem,
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

describe("shouldShowThinkingIndicator", () => {
  it("hides the indicator when the turn is settled", () => {
    equal(shouldShowThinkingIndicator([message("assistant")], "ready"), false);
  });

  it("hides the indicator while the answer streams", () => {
    equal(shouldShowThinkingIndicator([message("assistant")], "streaming"), false);
  });

  it("shows the indicator after sending before any output", () => {
    equal(shouldShowThinkingIndicator([message("user")], "submitted"), true);
  });

  it("shows the indicator on a new chat with no items", () => {
    equal(shouldShowThinkingIndicator([], "submitted"), true);
  });

  it("suppresses the indicator while an active process block shows progress", () => {
    equal(
      shouldShowThinkingIndicator([message("user"), process(true)], "submitted"),
      false,
    );
  });

  it("shows the indicator when the trailing process block has settled", () => {
    equal(shouldShowThinkingIndicator([process(false)], "submitted"), true);
  });
});
