import { deepStrictEqual, strictEqual } from "node:assert";
import { afterEach, describe, it } from "node:test";
import { conversationIdForChat } from "../src/lib/chat-conversation-id.ts";
import { queryClient } from "../src/lib/query-client.ts";
import { queryKeys } from "../src/lib/query-keys.ts";

const AGENT = "/w/alpha";

afterEach(() => {
  queryClient.clear();
});

describe("conversationIdForChat", () => {
  it("resolves a routine chat from the agent's own board rows", () => {
    queryClient.setQueryData(queryKeys.activity(AGENT), [
      { id: "m-42", session_key: "routine-7" },
    ]);
    strictEqual(conversationIdForChat(AGENT, "routine-7"), "m-42");
  });

  it("falls back to the all-conversations aggregate, scoped to this agent", () => {
    queryClient.setQueryData(queryKeys.allConversations([AGENT, "/w/beta"]), [
      { id: "wrong", session_key: "routine-7", agent_path: "/w/beta" },
      { id: "m-42", session_key: "routine-7", agent_path: AGENT },
    ]);
    strictEqual(conversationIdForChat(AGENT, "routine-7"), "m-42");
  });

  it("answers NULL for a routine chat no cached list can name", () => {
    strictEqual(conversationIdForChat(AGENT, "routine-7"), null);
    queryClient.setQueryData(queryKeys.activity(AGENT), []);
    strictEqual(conversationIdForChat(AGENT, "routine-7"), null);
  });

  it("answers NULL for a session that is not a chat at all", () => {
    queryClient.setQueryData(queryKeys.activity(AGENT), []);
    strictEqual(conversationIdForChat(AGENT, "main"), null);
  });

  it("still resolves a standard mission with no list cached", () => {
    strictEqual(conversationIdForChat(AGENT, "activity-m-9"), "m-9");
  });

  it("prefers the agent's own board rows over the aggregate", () => {
    queryClient.setQueryData(queryKeys.activity(AGENT), [
      { id: "fresh", session_key: "routine-7" },
    ]);
    queryClient.setQueryData(queryKeys.allConversations([AGENT]), [
      { id: "stale", session_key: "routine-7", agent_path: AGENT },
    ]);
    deepStrictEqual(conversationIdForChat(AGENT, "routine-7"), "fresh");
  });
});
