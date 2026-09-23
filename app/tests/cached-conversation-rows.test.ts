import { deepStrictEqual } from "node:assert";
import { describe, it } from "node:test";
import { QueryClient } from "@tanstack/react-query";
import {
  allCachedActivityRows,
  allCachedConversationRows,
  unionConversationRows,
} from "../src/lib/cached-conversation-rows.ts";
import { queryKeys } from "../src/lib/query-keys.ts";

describe("unionConversationRows", () => {
  it("keeps the first row named for an id and drops the repeats", () => {
    deepStrictEqual(
      unionConversationRows(
        [{ id: "m1", session_key: "sess-1" }],
        [{ id: "m1" }, { id: "m2", session_key: "sess-2" }],
      ),
      [
        { id: "m1", session_key: "sess-1" },
        { id: "m2", session_key: "sess-2" },
      ],
    );
  });

  it("projects away everything but the id and the conversation key", () => {
    deepStrictEqual(
      unionConversationRows([
        {
          id: "m1",
          session_key: "sess-1",
          title: "Ship it",
          status: "running",
        },
      ]),
      [{ id: "m1", session_key: "sess-1" }],
    );
  });

  it("skips a source that is not cached at all", () => {
    deepStrictEqual(unionConversationRows(undefined, [{ id: "m1" }]), [
      { id: "m1" },
    ]);
  });
});

describe("allCachedActivityRows", () => {
  it("unions both caches, so an empty served read hides nothing", () => {
    // The per-agent query can be cached EMPTY from a sweep that ran while the
    // agent was idle; the aggregate still names the missions it owns.
    const qc = new QueryClient();
    qc.setQueryData(queryKeys.activity("/w/a"), []);
    qc.setQueryData(
      queryKeys.allConversations(["/w/a"]),
      [{ id: "m1", session_key: "sess-1", agent_path: "/w/a" }],
      { updatedAt: 1_000 },
    );

    deepStrictEqual(allCachedActivityRows(qc, "/w/a"), [
      { id: "m1", session_key: "sess-1" },
    ]);
  });

  it("names a mission both caches hold exactly once", () => {
    const qc = new QueryClient();
    qc.setQueryData(queryKeys.activity("/w/a"), [
      { id: "m1", session_key: "sess-1" },
      { id: "m2" },
    ]);
    qc.setQueryData(
      queryKeys.allConversations(["/w/a"]),
      [
        { id: "m1", session_key: "sess-1", agent_path: "/w/a" },
        { id: "m3", session_key: "sess-3", agent_path: "/w/a" },
      ],
      { updatedAt: 1_000 },
    );

    deepStrictEqual(
      allCachedActivityRows(qc, "/w/a").map((row) => row.id),
      ["m1", "m2", "m3"],
    );
  });

  it("serves the per-agent read on its own when no aggregate was swept", () => {
    const qc = new QueryClient();
    qc.setQueryData(queryKeys.activity("/w/a"), [
      { id: "m1", session_key: "sess-1" },
      { id: "m2" },
    ]);

    deepStrictEqual(allCachedActivityRows(qc, "/w/a"), [
      { id: "m1", session_key: "sess-1" },
      { id: "m2" },
    ]);
  });

  it("ignores another agent's rows in the aggregate", () => {
    const qc = new QueryClient();
    qc.setQueryData(
      queryKeys.allConversations(["/w/a", "/w/b"]),
      [
        { id: "m1", session_key: "sess-1", agent_path: "/w/a" },
        { id: "m9", session_key: "sess-9", agent_path: "/w/b" },
      ],
      { updatedAt: 1_000 },
    );

    deepStrictEqual(allCachedActivityRows(qc, "/w/a"), [
      { id: "m1", session_key: "sess-1" },
    ]);
  });

  it("unions across roster variants, not just the newest sweep", () => {
    const qc = new QueryClient();
    qc.setQueryData(
      queryKeys.allConversations(["/w/a", "/w/b"]),
      [{ id: "m1", session_key: "sess-1", agent_path: "/w/a" }],
      { updatedAt: 2_000 },
    );
    qc.setQueryData(
      queryKeys.allConversations(["/w/a"]),
      [{ id: "m2", session_key: "sess-2", agent_path: "/w/a" }],
      { updatedAt: 1_000 },
    );

    deepStrictEqual(allCachedActivityRows(qc, "/w/a"), [
      { id: "m1", session_key: "sess-1" },
      { id: "m2", session_key: "sess-2" },
    ]);
  });

  it("is empty when neither cache holds the agent", () => {
    deepStrictEqual(allCachedActivityRows(new QueryClient(), "/w/a"), []);
  });
});

describe("allCachedConversationRows", () => {
  const PATHS = ["/w/a", "/w/b"];

  it("unions the served aggregate with the newest roster variant", () => {
    // The served key is the CURRENT roster's; a variant swept under an older
    // roster still names missions the current fan-out has not returned yet.
    const qc = new QueryClient();
    qc.setQueryData(
      queryKeys.allConversations(PATHS),
      [{ id: "m1", session_key: "sess-1" }],
      { updatedAt: 2_000 },
    );
    qc.setQueryData(
      queryKeys.allConversations(["/w/a"]),
      [{ id: "m1" }, { id: "m2", session_key: "sess-2" }],
      { updatedAt: 1_000 },
    );

    deepStrictEqual(allCachedConversationRows(qc, PATHS), [
      { id: "m1", session_key: "sess-1" },
      { id: "m2", session_key: "sess-2" },
    ]);
  });

  it("falls back to the newest variant when the served key holds nothing", () => {
    const qc = new QueryClient();
    qc.setQueryData(
      queryKeys.allConversations(["/w/a"]),
      [{ id: "m2", session_key: "sess-2" }],
      { updatedAt: 1_000 },
    );

    deepStrictEqual(allCachedConversationRows(qc, PATHS), [
      { id: "m2", session_key: "sess-2" },
    ]);
  });

  it("is empty when the aggregate was never swept", () => {
    deepStrictEqual(allCachedConversationRows(new QueryClient(), PATHS), []);
  });
});
