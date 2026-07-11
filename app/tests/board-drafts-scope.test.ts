import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  boardDraftsView,
  newConversationDraftKey,
} from "../src/stores/drafts.ts";

describe("newConversationDraftKey", () => {
  it("scopes per agent and keeps the plain key without a scope", () => {
    strictEqual(newConversationDraftKey("agent-a"), "new-conversation:agent-a");
    strictEqual(newConversationDraftKey(), "new-conversation");
    strictEqual(newConversationDraftKey(null), "new-conversation");
  });
});

describe("boardDraftsView (HOU-730)", () => {
  const raw = {
    "activity-1": { text: "follow-up" },
    "new-conversation:agent-a": { text: "for A" },
    "new-conversation:agent-b": { text: "for B" },
    "new-conversation": { text: "mission control" },
    empty: { text: "" },
  };

  it("surfaces only this view's scoped draft under the plain key", () => {
    deepStrictEqual(boardDraftsView(raw, newConversationDraftKey("agent-a")), {
      "activity-1": "follow-up",
      "new-conversation": "for A",
    });
  });

  it("never leaks another agent's parked first message", () => {
    deepStrictEqual(boardDraftsView(raw, newConversationDraftKey("agent-c")), {
      "activity-1": "follow-up",
    });
  });

  it("an unscoped view sees only the unscoped draft", () => {
    deepStrictEqual(boardDraftsView(raw, newConversationDraftKey()), {
      "activity-1": "follow-up",
      "new-conversation": "mission control",
    });
  });

  it("session-keyed drafts pass through untouched", () => {
    deepStrictEqual(
      boardDraftsView({ "chat-x": { text: "hi" } }, newConversationDraftKey()),
      { "chat-x": "hi" },
    );
  });
});
