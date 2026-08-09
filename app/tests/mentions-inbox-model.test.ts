import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  buildMentionInbox,
  type MentionInboxConversation,
} from "../src/components/board/mentions-inbox-model.ts";
import type { ReadCursorStore } from "../src/lib/read-cursors.ts";
import { ROUTINE_SETUP_AGENT_MODE } from "../src/lib/routine-chat-setup.ts";
import type { Agent } from "../src/lib/types.ts";

const ME = "user-me";
const MATE = "user-mate";
const SINCE = Date.parse("2026-07-01T00:00:00.000Z");

const store = (cursors: ReadCursorStore["cursors"] = {}): ReadCursorStore => ({
  since: SINCE,
  cursors,
});

const conv = (
  over: Partial<MentionInboxConversation> & { id: string },
): MentionInboxConversation => ({
  agent_path: "/w/alpha",
  agent_name: "Alpha",
  session_key: `activity-${over.id}`,
  title: `Mission ${over.id}`,
  type: "activity",
  created_by: MATE,
  contributors: [{ user_id: MATE }],
  updated_at: "2026-07-10T00:00:00.000Z",
  ...over,
});

describe("buildMentionInbox", () => {
  it("returns [] with nobody signed in", () => {
    const c = conv({
      id: "m1",
      mentioned: [{ user_id: ME, at: "2026-07-05T00:00:00.000Z" }],
    });
    deepStrictEqual(buildMentionInbox([c], store(), null), []);
  });

  it("keeps only missions that @mention me", () => {
    const rows = buildMentionInbox(
      [
        conv({ id: "mine", created_by: ME, contributors: [{ user_id: ME }] }),
        conv({ id: "theirs" }),
        conv({
          id: "pinged",
          mentioned: [{ user_id: ME, at: "2026-07-05T00:00:00.000Z" }],
        }),
        conv({
          id: "other-pinged",
          mentioned: [
            { user_id: "user-third", at: "2026-07-05T00:00:00.000Z" },
          ],
        }),
      ],
      store(),
      ME,
    );
    deepStrictEqual(
      rows.map((r) => r.conversationId),
      ["pinged"],
    );
  });

  it("maps the full row, newest mention first, id as tiebreak", () => {
    const rows = buildMentionInbox(
      [
        conv({
          id: "b",
          mentioned: [
            { user_id: ME, at: "2026-07-05T00:00:00.000Z", by: MATE },
          ],
        }),
        conv({
          id: "newest",
          agent_path: "/w/beta",
          agent_name: "Beta",
          mentioned: [
            { user_id: ME, at: "2026-07-02T00:00:00.000Z", by: MATE },
            { user_id: ME, at: "2026-07-09T00:00:00.000Z", by: "user-third" },
          ],
        }),
        conv({
          id: "a",
          mentioned: [{ user_id: ME, at: "2026-07-05T00:00:00.000Z" }],
        }),
      ],
      store(),
      ME,
    );

    deepStrictEqual(
      rows.map((r) => r.conversationId),
      ["newest", "a", "b"],
    );
    deepStrictEqual(rows[0], {
      conversationId: "newest",
      agentPath: "/w/beta",
      agentName: "Beta",
      sessionKey: "activity-newest",
      title: "Mission newest",
      at: Date.parse("2026-07-09T00:00:00.000Z"),
      byUserId: "user-third",
      unread: true,
      mentionOutstanding: true,
    });
    strictEqual(rows[1]?.byUserId, undefined);
  });

  it("flags unread per the read cursor", () => {
    const convs = [
      conv({
        id: "read",
        mentioned: [{ user_id: ME, at: "2026-07-05T00:00:00.000Z" }],
      }),
      conv({
        id: "unread",
        mentioned: [{ user_id: ME, at: "2026-07-05T00:00:00.000Z" }],
      }),
    ];
    const cursors = {
      "/w/alpha::read": { readAt: Date.parse("2026-07-11T00:00:00.000Z") },
    };
    const rows = buildMentionInbox(convs, store(cursors), ME);
    deepStrictEqual(
      rows.map((r) => [r.conversationId, r.unread]),
      [
        ["read", false],
        ["unread", true],
      ],
    );
  });

  it("separates ambient movement from an outstanding mention", () => {
    // The pill counts `mentionOutstanding` and the row dot reads `unread`, so
    // this is the assertion that stops a mission which merely MOVED from being
    // announced as "somebody typed your name".
    const convs = [
      conv({
        id: "moved",
        updated_at: "2026-07-10T00:00:00.000Z",
        mentioned: [{ user_id: ME, at: "2026-07-05T00:00:00.000Z" }],
      }),
      conv({
        id: "pinged",
        updated_at: "2026-07-10T00:00:00.000Z",
        mentioned: [{ user_id: ME, at: "2026-07-08T00:00:00.000Z" }],
      }),
      conv({
        id: "settled",
        updated_at: "2026-07-10T00:00:00.000Z",
        mentioned: [{ user_id: ME, at: "2026-07-05T00:00:00.000Z" }],
      }),
    ];
    const cursors = {
      // Read AFTER the mention but BEFORE the mission's last movement.
      "/w/alpha::moved": { readAt: Date.parse("2026-07-06T00:00:00.000Z") },
      // Read BEFORE the mention landed.
      "/w/alpha::pinged": { readAt: Date.parse("2026-07-06T00:00:00.000Z") },
      // Read after everything.
      "/w/alpha::settled": { readAt: Date.parse("2026-07-11T00:00:00.000Z") },
    };
    const rows = buildMentionInbox(convs, store(cursors), ME);
    deepStrictEqual(
      rows.map((r) => [r.conversationId, r.unread, r.mentionOutstanding]),
      [
        ["pinged", true, true],
        ["moved", true, false],
        ["settled", false, false],
      ],
    );
  });

  it("keeps a never-opened mention outstanding however old it is", () => {
    // No cursor at all: `mentionReadFloorFor` deliberately has no `since`
    // fallback, so a mention that predates this device still counts on the pill.
    const rows = buildMentionInbox(
      [
        conv({
          id: "ancient",
          updated_at: "2026-06-01T00:00:00.000Z",
          mentioned: [{ user_id: ME, at: "2026-06-01T00:00:00.000Z" }],
        }),
      ],
      store(),
      ME,
    );
    strictEqual(rows[0]?.mentionOutstanding, true);
  });

  it("never builds a row from a mention I wrote about myself", () => {
    const rows = buildMentionInbox(
      [
        conv({
          id: "self",
          created_by: ME,
          contributors: [{ user_id: ME }],
          mentioned: [{ user_id: ME, at: "2026-07-05T00:00:00.000Z", by: ME }],
        }),
      ],
      store(),
      ME,
    );
    deepStrictEqual(rows, []);
  });

  it("excludes guided setup chats", () => {
    const rows = buildMentionInbox(
      [
        conv({
          id: "setup",
          agent: ROUTINE_SETUP_AGENT_MODE,
          mentioned: [{ user_id: ME, at: "2026-07-05T00:00:00.000Z" }],
        }),
      ],
      store(),
      ME,
    );
    deepStrictEqual(rows, []);
  });

  it("uses the roster name before the activity fallback", () => {
    const c = conv({
      id: "named",
      agent_name: "Houston",
      mentioned: [{ user_id: ME, at: "2026-07-05T00:00:00.000Z" }],
    });
    const roster = new Map([[c.agent_path, { name: "Kai" } as Agent]]);
    strictEqual(
      buildMentionInbox([c], store(), ME, roster)[0]?.agentName,
      "Kai",
    );
  });
});
