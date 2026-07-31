import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { ReadCursorStore } from "../src/lib/read-cursors.ts";
import { ROUTINE_SETUP_AGENT_MODE } from "../src/lib/routine-chat-setup.ts";
import {
  countUnreadByAgentPath,
  isUnreadForMe,
  type UnreadConversationInput,
} from "../src/lib/unread-model.ts";

const ME = "user-me";
const MATE = "user-mate";
const SINCE = Date.parse("2026-07-01T00:00:00.000Z");
const NEWER = "2026-07-10T00:00:00.000Z";
const OLDER = "2026-06-01T00:00:00.000Z";

const store = (cursors: ReadCursorStore["cursors"] = {}): ReadCursorStore => ({
  since: SINCE,
  cursors,
});

const conv = (
  over: Partial<UnreadConversationInput> = {},
): UnreadConversationInput => ({
  id: "m1",
  agent_path: "/w/alpha",
  type: "activity",
  updated_at: NEWER,
  ...over,
});

describe("isUnreadForMe", () => {
  it("is unread when my own mission moved after my floor", () => {
    strictEqual(isUnreadForMe(conv({ created_by: ME }), store(), ME), true);
  });

  it("is read once the cursor is past the update", () => {
    const cursors = { "/w/alpha::m1": { readAt: Date.parse(NEWER) } };
    strictEqual(
      isUnreadForMe(conv({ created_by: ME }), store(cursors), ME),
      false,
    );
  });

  it("keeps an outstanding mention unread even when it predates `since`", () => {
    // The second-device case: I install Houston today, and a mention from last
    // month is still addressed to me. `since` exists to suppress ambient
    // backlog, never a message that names me.
    strictEqual(
      isUnreadForMe(
        conv({ updated_at: OLDER, mentioned: [{ user_id: ME, at: OLDER }] }),
        store(),
        ME,
      ),
      true,
    );
  });

  it("clears a mention once I have opened that conversation", () => {
    const cursors = { "/w/alpha::m1": { readAt: Date.parse(NEWER) } };
    strictEqual(
      isUnreadForMe(
        conv({ updated_at: OLDER, mentioned: [{ user_id: ME, at: OLDER }] }),
        store(cursors),
        ME,
      ),
      false,
    );
  });

  it("keeps a mention unread when the mission moved on without me", () => {
    // Read at NEWER, but the mention landed after that: still my problem.
    const cursors = { "/w/alpha::m1": { readAt: Date.parse(NEWER) } };
    strictEqual(
      isUnreadForMe(
        conv({
          updated_at: NEWER,
          mentioned: [{ user_id: ME, at: "2026-07-11T00:00:00.000Z" }],
        }),
        store(cursors),
        ME,
      ),
      true,
    );
  });

  it("does not treat a mention I wrote about MYSELF as a claim on me", () => {
    // Otherwise the badge outlives every read: the mention clause has no
    // `since` floor, so a self-mention on a mission I never reopen would stay
    // lit forever. The OS ping already ignores self-authored mentions.
    strictEqual(
      isUnreadForMe(
        conv({
          updated_at: OLDER,
          created_by: MATE,
          contributors: [{ user_id: MATE }],
          mentioned: [{ user_id: ME, at: NEWER, by: ME }],
        }),
        store(),
        ME,
      ),
      false,
    );
  });

  it("keeps an authorless mention of me unread (pre-stamp entries)", () => {
    strictEqual(
      isUnreadForMe(
        conv({
          updated_at: OLDER,
          created_by: MATE,
          contributors: [{ user_id: MATE }],
          mentioned: [{ user_id: ME, at: OLDER }],
        }),
        store(),
        ME,
      ),
      true,
    );
  });

  it("does not treat a mention of someone else as my mention", () => {
    strictEqual(
      isUnreadForMe(
        conv({
          updated_at: OLDER,
          created_by: MATE,
          contributors: [{ user_id: MATE }],
          mentioned: [{ user_id: MATE, at: OLDER }],
        }),
        store(),
        ME,
      ),
      false,
    );
  });

  it("uses `since` as the floor, so history is not unread on a fresh device", () => {
    strictEqual(
      isUnreadForMe(conv({ created_by: ME, updated_at: OLDER }), store(), ME),
      false,
    );
  });

  it("counts a mission that only @mentions me, untouched by me", () => {
    const c = conv({
      created_by: MATE,
      contributors: [{ user_id: MATE }],
      mentioned: [{ user_id: ME, at: NEWER, by: MATE }],
    });
    strictEqual(isUnreadForMe(c, store(), ME), true);
  });

  it("ignores a teammate's mission that never names me", () => {
    const c = conv({ created_by: MATE, contributors: [{ user_id: MATE }] });
    strictEqual(isUnreadForMe(c, store(), ME), false);
  });

  it("keeps an unattributed mission unread-able (desktop parity)", () => {
    strictEqual(isUnreadForMe(conv(), store(), ME), true);
  });

  it("is never unread with nobody signed in", () => {
    strictEqual(isUnreadForMe(conv({ created_by: ME }), store(), null), false);
  });

  it("is never unread for a guided setup chat", () => {
    strictEqual(
      isUnreadForMe(
        conv({ created_by: ME, agent: ROUTINE_SETUP_AGENT_MODE }),
        store(),
        ME,
      ),
      false,
    );
  });

  it("is never unread without a usable updated_at", () => {
    strictEqual(
      isUnreadForMe(
        conv({ created_by: ME, updated_at: undefined }),
        store(),
        ME,
      ),
      false,
    );
    strictEqual(
      isUnreadForMe(
        conv({ created_by: ME, updated_at: "whenever" }),
        store(),
        ME,
      ),
      false,
    );
  });
});

describe("countUnreadByAgentPath", () => {
  it("counts only relevant, unread activity rows per agent", () => {
    const convs: UnreadConversationInput[] = [
      conv({ id: "a1", created_by: ME }),
      conv({
        id: "a2",
        created_by: MATE,
        contributors: [{ user_id: MATE }],
        mentioned: [{ user_id: ME, at: NEWER }],
      }),
      // A teammate's own mission: relevant to them, not to me.
      conv({ id: "a3", created_by: MATE, contributors: [{ user_id: MATE }] }),
      // Already read.
      conv({ id: "a4", created_by: ME }),
      conv({ id: "b1", agent_path: "/w/beta", created_by: ME }),
    ];
    const cursors = { "/w/alpha::a4": { readAt: Date.parse(NEWER) } };
    deepStrictEqual(countUnreadByAgentPath(convs, store(cursors), ME), {
      "/w/alpha": 2,
      "/w/beta": 1,
    });
  });

  it("excludes setup chats and non-activity rows", () => {
    const convs: UnreadConversationInput[] = [
      conv({ id: "p1", type: "primary", created_by: ME }),
      conv({ id: "s1", agent: ROUTINE_SETUP_AGENT_MODE, created_by: ME }),
    ];
    deepStrictEqual(countUnreadByAgentPath(convs, store(), ME), {});
  });

  it("counts nothing with nobody signed in", () => {
    deepStrictEqual(
      countUnreadByAgentPath([conv({ created_by: ME })], store(), null),
      {},
    );
  });
});
