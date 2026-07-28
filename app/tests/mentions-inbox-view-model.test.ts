import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type {
  MentionInboxConversation,
  MentionInboxRow,
} from "../src/components/board/mentions-inbox-model.ts";
import {
  mentionCountLabel,
  mentionerIds,
  resolveMentionerName,
  storedContributorNames,
} from "../src/components/board/mentions-inbox-view-model.ts";
import type { UserProfile } from "../src/hooks/queries/use-user-profiles.ts";

const row = (over: Partial<MentionInboxRow> = {}): MentionInboxRow => ({
  conversationId: "m1",
  agentPath: "/agents/finance",
  agentName: "Finance",
  sessionKey: "activity-m1",
  title: "Close the books",
  at: Date.parse("2026-07-10T00:00:00.000Z"),
  unread: true,
  mentionOutstanding: true,
  ...over,
});

const conv = (
  over: Partial<MentionInboxConversation> = {},
): MentionInboxConversation => ({
  id: "m1",
  agent_path: "/agents/finance",
  agent_name: "Finance",
  session_key: "activity-m1",
  title: "Close the books",
  type: "activity",
  ...over,
});

const profile = (name: string): UserProfile => ({ name, avatarUrl: null });

describe("mentionCountLabel", () => {
  it("renders small counts verbatim", () => {
    strictEqual(mentionCountLabel(0), "0");
    strictEqual(mentionCountLabel(1), "1");
    strictEqual(mentionCountLabel(99), "99");
  });

  it("clamps at 99+ so the pill can never push the title off its line", () => {
    strictEqual(mentionCountLabel(100), "99+");
    strictEqual(mentionCountLabel(4321), "99+");
  });
});

describe("mentionerIds", () => {
  it("dedupes a repeat mentioner into one profile lookup", () => {
    deepStrictEqual(
      mentionerIds([
        row({ conversationId: "a", byUserId: "u-ana" }),
        row({ conversationId: "b", byUserId: "u-bob" }),
        row({ conversationId: "c", byUserId: "u-ana" }),
      ]),
      ["u-ana", "u-bob"],
    );
  });

  it("keeps row order so the query key does not churn between renders", () => {
    deepStrictEqual(
      mentionerIds([
        row({ conversationId: "a", byUserId: "u-zoe" }),
        row({ conversationId: "b", byUserId: "u-ana" }),
      ]),
      ["u-zoe", "u-ana"],
    );
  });

  it("skips rows with no known mentioner", () => {
    deepStrictEqual(mentionerIds([row(), row({ byUserId: "u-ana" })]), [
      "u-ana",
    ]);
  });

  it("is empty for an empty inbox", () => {
    deepStrictEqual(mentionerIds([]), []);
  });
});

describe("storedContributorNames", () => {
  it("collects server-stamped names across missions", () => {
    const names = storedContributorNames([
      conv({ contributors: [{ user_id: "u-ana", name: "Ana" }] }),
      conv({ id: "m2", contributors: [{ user_id: "u-bob", name: "Bob" }] }),
    ]);
    strictEqual(names.get("u-ana"), "Ana");
    strictEqual(names.get("u-bob"), "Bob");
  });

  it("keeps the first stored name, matching the board face stacks", () => {
    const names = storedContributorNames([
      conv({ contributors: [{ user_id: "u-ana", name: "Ana" }] }),
      conv({ id: "m2", contributors: [{ user_id: "u-ana", name: "Ana R." }] }),
    ]);
    strictEqual(names.get("u-ana"), "Ana");
  });

  it("ignores contributors with no stored name", () => {
    const names = storedContributorNames([
      conv({ contributors: [{ user_id: "u-ana" }] }),
    ]);
    strictEqual(names.has("u-ana"), false);
  });

  it("tolerates missions with no attribution at all", () => {
    strictEqual(storedContributorNames([conv()]).size, 0);
  });
});

describe("resolveMentionerName", () => {
  const stored = new Map([["u-ana", "Ana (stored)"]]);

  it("prefers the live profile name", () => {
    strictEqual(
      resolveMentionerName(
        "u-ana",
        new Map([["u-ana", profile("Ana Lopez")]]),
        stored,
      ),
      "Ana Lopez",
    );
  });

  it("falls back to the stored contributor name before the id", () => {
    strictEqual(
      resolveMentionerName("u-ana", new Map(), stored),
      "Ana (stored)",
    );
  });

  it("never renders a raw user id", () => {
    const id = "0f2c9a1e-7d43-4c5b-9a10-6b8e2f4d1c33";
    const label = resolveMentionerName(id, new Map(), new Map());
    strictEqual(label, "0f2c9a1e");
    strictEqual(label === id, false);
  });
});
