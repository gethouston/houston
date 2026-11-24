import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  boardDraftKey,
  newConversationDraftKey,
} from "../src/stores/drafts.ts";

describe("newConversationDraftKey", () => {
  it("scopes per agent and keeps the plain key without a scope", () => {
    strictEqual(newConversationDraftKey("agent-a"), "new-conversation:agent-a");
    strictEqual(newConversationDraftKey(), "new-conversation");
    strictEqual(newConversationDraftKey(null), "new-conversation");
  });
});

describe("boardDraftKey (HOU-730)", () => {
  it("reads and writes the board's new-conversation draft in this view's slot", () => {
    strictEqual(
      boardDraftKey("new-conversation", newConversationDraftKey("agent-a")),
      "new-conversation:agent-a",
    );
  });

  it("an unscoped view keeps the plain slot", () => {
    strictEqual(
      boardDraftKey("new-conversation", newConversationDraftKey()),
      "new-conversation",
    );
  });

  it("session-keyed drafts pass through untouched", () => {
    strictEqual(
      boardDraftKey("chat-x", newConversationDraftKey("agent-a")),
      "chat-x",
    );
  });
});
