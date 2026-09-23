import { deepStrictEqual } from "node:assert";
import { describe, it } from "node:test";
import { boardItemConversationRow } from "../src/components/board/board-item-row.ts";

// A mission card is the only place a single-mission delete seam can read the
// deleted conversation's key from, and `metadata` is an open bag.

describe("boardItemConversationRow", () => {
  const card = { title: "t", status: "todo", updatedAt: "2026-09-23" };

  it("reads the card's session key back as the row's", () => {
    deepStrictEqual(
      boardItemConversationRow({
        ...card,
        id: "m1",
        metadata: { sessionKey: "sess-1", agentPath: "/a" },
      }),
      { id: "m1", session_key: "sess-1" },
    );
  });

  it("carries no session key for a card that has none", () => {
    deepStrictEqual(
      boardItemConversationRow({ ...card, id: "m1", metadata: {} }),
      { id: "m1" },
    );
    deepStrictEqual(boardItemConversationRow({ ...card, id: "m1" }), {
      id: "m1",
    });
  });

  it("ignores a metadata entry that is not a string", () => {
    deepStrictEqual(
      boardItemConversationRow({
        ...card,
        id: "m1",
        metadata: { sessionKey: 7 },
      }),
      { id: "m1" },
    );
  });
});
