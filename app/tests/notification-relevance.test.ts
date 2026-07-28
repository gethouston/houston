import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  findSessionConversation,
  type SessionConversationRow,
  shouldNotifyCompletion,
} from "../src/lib/notification-relevance.ts";

const ME = "user-me";
const MATE = "user-mate";

const row = (
  over: Partial<SessionConversationRow> & { session_key: string },
): SessionConversationRow => ({
  agent_path: "/w/alpha",
  ...over,
});

describe("findSessionConversation", () => {
  const rows = [
    row({ session_key: "activity-1", created_by: ME }),
    row({ session_key: "activity-2", created_by: MATE }),
    row({ session_key: "activity-1", agent_path: "/w/beta", created_by: MATE }),
  ];

  it("matches the session key within the agent", () => {
    strictEqual(
      findSessionConversation(rows, "/w/alpha", "activity-2")?.created_by,
      MATE,
    );
  });

  it("never crosses agents on a shared session key", () => {
    strictEqual(
      findSessionConversation(rows, "/w/beta", "activity-1")?.created_by,
      MATE,
    );
    strictEqual(
      findSessionConversation(rows, "/w/alpha", "activity-1")?.created_by,
      ME,
    );
  });

  it("is undefined when the roster cache has no such row", () => {
    strictEqual(
      findSessionConversation(rows, "/w/alpha", "activity-9"),
      undefined,
    );
    strictEqual(
      findSessionConversation(undefined, "/w/alpha", "activity-1"),
      undefined,
    );
  });
});

describe("shouldNotifyCompletion", () => {
  const mine = row({ session_key: "activity-1", created_by: ME });
  const theirs = row({
    session_key: "activity-2",
    created_by: MATE,
    contributors: [{ user_id: MATE }],
  });
  const unattributed = row({ session_key: "activity-3" });
  const mentionsMe = row({
    session_key: "activity-4",
    created_by: MATE,
    contributors: [{ user_id: MATE }],
    mentioned: [{ user_id: ME, at: "2026-07-01T10:00:00.000Z", by: MATE }],
  });
  const rows = [mine, theirs, unattributed, mentionsMe];

  const notify = (sessionKey: string, selfId: string | null) =>
    shouldNotifyCompletion({
      rows,
      agentPath: "/w/alpha",
      sessionKey,
      selfId,
    });

  it("notifies for everything when there is no signed-in user", () => {
    strictEqual(notify("activity-1", null), true);
    strictEqual(notify("activity-2", null), true);
    strictEqual(notify("activity-9", null), true);
  });

  it("notifies for my own mission", () => {
    strictEqual(notify("activity-1", ME), true);
  });

  it("notifies for an unattributed mission (desktop parity, signed in)", () => {
    strictEqual(notify("activity-3", ME), true);
  });

  it("notifies for a teammate's mission that @mentions me", () => {
    strictEqual(notify("activity-4", ME), true);
  });

  it("stays silent on a teammate's mission that never names me", () => {
    strictEqual(notify("activity-2", ME), false);
  });

  it("fails OPEN on an unknown session", () => {
    strictEqual(notify("activity-9", ME), true);
    strictEqual(
      shouldNotifyCompletion({
        rows: undefined,
        agentPath: "/w/alpha",
        sessionKey: "activity-2",
        selfId: ME,
      }),
      true,
    );
  });
});
