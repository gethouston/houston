import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  isRelevantToMe,
  latestMentionAtFor,
  latestMentionFor,
  missionIsMine,
  missionMentionsMe,
  type RelevanceConversation,
} from "../src/lib/mission-relevance.ts";

const ME = "user-me";
const MATE = "user-mate";

const conv = (
  over: Partial<RelevanceConversation> = {},
): RelevanceConversation => ({ ...over }) as RelevanceConversation;

describe("missionIsMine", () => {
  it("matches the creator", () => {
    strictEqual(missionIsMine(conv({ created_by: ME }), ME), true);
  });

  it("matches a contributor", () => {
    strictEqual(
      missionIsMine(
        conv({ created_by: MATE, contributors: [{ user_id: ME }] }),
        ME,
      ),
      true,
    );
  });

  it("does NOT match a teammate's own mission", () => {
    strictEqual(
      missionIsMine(
        conv({ created_by: MATE, contributors: [{ user_id: MATE }] }),
        ME,
      ),
      false,
    );
  });

  it("treats a mission with NO attribution at all as mine", () => {
    // The load-bearing desktop-parity clause: legacy / pre-Teams missions carry
    // no created_by and no contributors and must never go silent.
    strictEqual(missionIsMine(conv(), ME), true);
    strictEqual(missionIsMine(conv({ contributors: [] }), ME), true);
  });
});

describe("missionMentionsMe", () => {
  it("is true when the aggregate names me", () => {
    const c = conv({
      created_by: MATE,
      mentioned: [{ user_id: ME, at: "2026-07-01T10:00:00.000Z", by: MATE }],
    });
    strictEqual(missionMentionsMe(c, ME), true);
  });

  it("is false when it names only somebody else", () => {
    const c = conv({
      mentioned: [{ user_id: MATE, at: "2026-07-01T10:00:00.000Z" }],
    });
    strictEqual(missionMentionsMe(c, ME), false);
  });

  it("is false with no aggregate at all", () => {
    strictEqual(missionMentionsMe(conv(), ME), false);
  });

  it("is false when I mentioned MYSELF", () => {
    // Typing your own name is not news, and the OS ping already refuses to fire
    // on it. Counting it here would earn a permanent inbox row and a
    // mention-unread badge that no amount of reading can clear.
    const c = conv({
      created_by: ME,
      mentioned: [{ user_id: ME, at: "2026-07-01T10:00:00.000Z", by: ME }],
    });
    strictEqual(missionMentionsMe(c, ME), false);
  });

  it("still counts a mention of me carrying NO author", () => {
    // Pre-stamp entries have no `by`. Reading "no author" as "me" would go
    // silent on every mention written before the gateway stamped authors.
    const c = conv({
      created_by: MATE,
      mentioned: [{ user_id: ME, at: "2026-07-01T10:00:00.000Z" }],
    });
    strictEqual(missionMentionsMe(c, ME), true);
  });

  it("a self-mention never hides a real one on the same mission", () => {
    const c = conv({
      mentioned: [
        { user_id: ME, at: "2026-07-01T10:00:00.000Z", by: ME },
        { user_id: ME, at: "2026-07-02T10:00:00.000Z", by: MATE },
      ],
    });
    strictEqual(missionMentionsMe(c, ME), true);
  });
});

describe("latestMentionFor", () => {
  it("returns the newest entry for me, with its author", () => {
    const c = conv({
      mentioned: [
        { user_id: ME, at: "2026-07-01T10:00:00.000Z", by: MATE },
        { user_id: MATE, at: "2026-07-09T10:00:00.000Z" },
        { user_id: ME, at: "2026-07-05T10:00:00.000Z", by: "user-third" },
      ],
    });
    const latest = latestMentionFor(c, ME);
    strictEqual(latest?.at, Date.parse("2026-07-05T10:00:00.000Z"));
    strictEqual(latest?.mention.by, "user-third");
  });

  it("returns null when nobody mentioned me", () => {
    strictEqual(latestMentionFor(conv(), ME), null);
  });

  it("ignores a mention I wrote about myself", () => {
    const c = conv({
      mentioned: [{ user_id: ME, at: "2026-07-01T10:00:00.000Z", by: ME }],
    });
    strictEqual(latestMentionFor(c, ME), null);
  });

  it("returns an authorless mention of me, so pre-stamp pings survive", () => {
    const c = conv({
      mentioned: [{ user_id: ME, at: "2026-07-01T10:00:00.000Z" }],
    });
    strictEqual(
      latestMentionFor(c, ME)?.at,
      Date.parse("2026-07-01T10:00:00.000Z"),
    );
  });

  it("skips a NEWER self-mention in favour of a real one", () => {
    // The newest entry is mine; the inbox must still show me the teammate's.
    const c = conv({
      mentioned: [
        { user_id: ME, at: "2026-07-05T10:00:00.000Z", by: MATE },
        { user_id: ME, at: "2026-07-09T10:00:00.000Z", by: ME },
      ],
    });
    const latest = latestMentionFor(c, ME);
    strictEqual(latest?.at, Date.parse("2026-07-05T10:00:00.000Z"));
    strictEqual(latest?.mention.by, MATE);
  });
});

describe("latestMentionAtFor", () => {
  it("gives epoch ms of the newest mention", () => {
    const c = conv({
      mentioned: [{ user_id: ME, at: "2026-07-01T10:00:00.000Z" }],
    });
    strictEqual(
      latestMentionAtFor(c, ME),
      Date.parse("2026-07-01T10:00:00.000Z"),
    );
  });

  it("ignores an unparseable timestamp instead of inventing a ping", () => {
    const c = conv({ mentioned: [{ user_id: ME, at: "not-a-date" }] });
    strictEqual(latestMentionAtFor(c, ME), null);
  });

  it("an unparseable entry never hides a well-formed sibling", () => {
    const c = conv({
      mentioned: [
        { user_id: ME, at: "not-a-date" },
        { user_id: ME, at: "2026-07-02T00:00:00.000Z" },
      ],
    });
    strictEqual(
      latestMentionAtFor(c, ME),
      Date.parse("2026-07-02T00:00:00.000Z"),
    );
  });

  it("returns null with no mentions", () => {
    strictEqual(latestMentionAtFor(conv(), ME), null);
  });
});

describe("isRelevantToMe", () => {
  const mates = conv({ created_by: MATE, contributors: [{ user_id: MATE }] });

  it("everything is relevant when signed out / single player", () => {
    strictEqual(isRelevantToMe(mates, null), true);
    strictEqual(isRelevantToMe(undefined, null), true);
  });

  it("fails OPEN on an unknown mission", () => {
    strictEqual(isRelevantToMe(undefined, ME), true);
  });

  it("keeps an unattributed mission relevant for a signed-in user", () => {
    strictEqual(isRelevantToMe(conv(), ME), true);
  });

  it("is relevant when the mission is mine", () => {
    strictEqual(isRelevantToMe(conv({ created_by: ME }), ME), true);
  });

  it("is relevant when it only @mentions me", () => {
    const c = conv({
      created_by: MATE,
      contributors: [{ user_id: MATE }],
      mentioned: [{ user_id: ME, at: "2026-07-01T10:00:00.000Z", by: MATE }],
    });
    strictEqual(isRelevantToMe(c, ME), true);
  });

  it("is NOT made relevant by a mention I wrote about myself", () => {
    const c = conv({
      created_by: MATE,
      contributors: [{ user_id: MATE }],
      mentioned: [{ user_id: ME, at: "2026-07-01T10:00:00.000Z", by: ME }],
    });
    strictEqual(isRelevantToMe(c, ME), false);
  });

  it("is NOT relevant for a teammate's mission that never names me", () => {
    strictEqual(isRelevantToMe(mates, ME), false);
    strictEqual(
      isRelevantToMe(
        conv({
          created_by: MATE,
          contributors: [{ user_id: MATE }],
          mentioned: [
            { user_id: "user-third", at: "2026-07-01T10:00:00.000Z" },
          ],
        }),
        ME,
      ),
      false,
    );
  });
});
