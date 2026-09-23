import { deepStrictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  agentConversationDraftKeys,
  captureAgentDraftKeys,
  conversationDraftKeysFor,
  conversationDraftKeysOf,
} from "../src/lib/conversation-drafts.ts";

// A mission's chat is keyed `session_key ?? activity-<id>` (`rowSessionKey`),
// so a delete seam that only forgets `activity-<id>` leaves the unsent work of
// every mission that carries a session key parked forever.

describe("conversationDraftKeysOf", () => {
  it("forgets a mission's own conversation key, not just the id stand-in", () => {
    deepStrictEqual(
      conversationDraftKeysOf({ id: "m1", session_key: "sess-9" }),
      ["sess-9", "activity-m1"],
    );
  });

  it("is the id stand-in alone for a row that carries no session key", () => {
    deepStrictEqual(conversationDraftKeysOf({ id: "m1" }), ["activity-m1"]);
  });

  it("never names the same key twice", () => {
    deepStrictEqual(
      conversationDraftKeysOf({ id: "m1", session_key: "activity-m1" }),
      ["activity-m1"],
    );
  });
});

describe("conversationDraftKeysFor", () => {
  const rows = [
    { id: "m1", session_key: "sess-1" },
    { id: "m2" },
    { id: "untouched", session_key: "sess-3" },
  ];

  it("covers every deleted mission, each under its own keys", () => {
    deepStrictEqual(conversationDraftKeysFor(["m1", "m2"], rows), [
      "sess-1",
      "activity-m1",
      "activity-m2",
    ]);
  });

  it("falls back to the id stand-in for an id the cache no longer holds", () => {
    deepStrictEqual(conversationDraftKeysFor(["gone"], rows), [
      "activity-gone",
    ]);
  });

  it("leaves a mission that was not deleted alone", () => {
    deepStrictEqual(conversationDraftKeysFor([], rows), []);
  });
});

describe("agentConversationDraftKeys", () => {
  it("covers the agent's free-form chat and every mission it owned", () => {
    deepStrictEqual(
      agentConversationDraftKeys("a1", [
        { id: "m1", session_key: "sess-1" },
        { id: "m2" },
      ]),
      ["chat-a1", "sess-1", "activity-m1", "activity-m2"],
    );
  });

  it("is the free-form chat alone when no mission row is cached", () => {
    deepStrictEqual(agentConversationDraftKeys("a1", []), ["chat-a1"]);
  });
});

describe("agentConversationDraftKeys", () => {
  it("names each key once when the same mission is cached twice", () => {
    // The rows come from a UNION of two caches (the per-agent activity query
    // and the all-conversations aggregate), so the same mission arrives twice.
    deepStrictEqual(
      agentConversationDraftKeys("a1", [
        { id: "m1", session_key: "sess-1" },
        { id: "m1", session_key: "sess-1" },
      ]),
      ["chat-a1", "sess-1", "activity-m1"],
    );
  });
});

describe("captureAgentDraftKeys", () => {
  const roster = [
    { id: "a1", folderPath: "/w/Agent One" },
    { id: "a2", folderPath: "/w/Agent Two" },
  ];
  const rowsOf = (agentPath: string) =>
    agentPath === "/w/Agent One" ? [{ id: "m1", session_key: "sess-1" }] : [];

  it("resolves the agent's missions through its own board path", () => {
    deepStrictEqual(captureAgentDraftKeys("a1", roster, rowsOf), [
      "chat-a1",
      "sess-1",
      "activity-m1",
    ]);
  });

  it("holds the keys a roster change later makes unresolvable", () => {
    // The host emits `AgentsChanged` before the delete answers, so the roster
    // can lose the agent mid-delete; keys captured beforehand still name every
    // mission it owned.
    const captured = captureAgentDraftKeys("a1", roster, rowsOf);
    const afterReload = captureAgentDraftKeys(
      "a1",
      [{ id: "a2", folderPath: "/w/Agent Two" }],
      rowsOf,
    );

    deepStrictEqual(captured, ["chat-a1", "sess-1", "activity-m1"]);
    deepStrictEqual(afterReload, ["chat-a1"]);
  });

  it("is the free-form chat alone for an agent the roster never named", () => {
    deepStrictEqual(captureAgentDraftKeys("gone", roster, rowsOf), [
      "chat-gone",
    ]);
  });
});
