import { deepStrictEqual, strictEqual } from "node:assert";
import { afterEach, describe, it } from "node:test";
import { conversationIdForChat } from "../src/lib/chat-conversation-id.ts";
import { queryClient } from "../src/lib/query-client.ts";
import { queryKeys } from "../src/lib/query-keys.ts";

/**
 * HOU-945 review fix: the read-cursor tracker must not write a cursor it can
 * never read back.
 *
 * A chat's query key carries a SESSION key, and only the board lists can say
 * which mission that is. While they are cold the resolver used to hand back the
 * raw session key, which for a routine chat (`routine-<id>`) is unrelated to
 * the conversation id every unread surface looks up — so the cursor landed
 * under a key nothing reads, and the badge it was meant to clear stayed lit.
 *
 * This drives the resolver against the app's real query cache, seeded directly,
 * because the "which cache answers, and when is it cold" question IS the
 * behaviour under test.
 */

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
    // The regression: this used to answer "routine-7", writing a cursor under a
    // key no unread surface ever looks up.
    strictEqual(conversationIdForChat(AGENT, "routine-7"), null);
    queryClient.setQueryData(queryKeys.activity(AGENT), []);
    strictEqual(conversationIdForChat(AGENT, "routine-7"), null);
  });

  it("answers NULL for a session that is not a chat at all", () => {
    queryClient.setQueryData(queryKeys.activity(AGENT), []);
    strictEqual(conversationIdForChat(AGENT, "main"), null);
  });

  it("still resolves a standard mission with no list cached", () => {
    // `activity-<id>` carries the mission id in the key itself, so a cold cache
    // costs nothing here — only the keys that need a lookup can go unresolved.
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
