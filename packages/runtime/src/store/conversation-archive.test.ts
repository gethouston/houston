import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ChatMessage } from "@houston/runtime-client";
import { describe, expect, test } from "vitest";
import {
  ARCHIVE_TAIL_BYTES,
  ARCHIVE_TRIGGER_BYTES,
  archiveDirFor,
  tailCutIndex,
  totalMessageCount,
} from "./conversation-archive";
import {
  appendAssistantMessageAt,
  appendUserMessageAt,
  deleteConversationAt,
  getHistoryAt,
  listConversationsAt,
  loadConversation,
  loadFullConversation,
  type StoredConversation,
} from "./conversation-file";
import { truncateConversationMutationAt } from "./conversation-truncate";

const freshDir = () => mkdtempSync(join(tmpdir(), "houston-archive-"));
const KB = 1024;

/** A turn of one user message and one assistant reply of ~`replyKb` KB. */
function appendTurn(dir: string, id: string, n: number, replyKb: number) {
  const turnId = `t${n}`;
  appendUserMessageAt(dir, id, `question ${n}`, { turnId });
  appendAssistantMessageAt(dir, id, `reply ${n} ${"x".repeat(replyKb * KB)}`, {
    turnId,
  });
}

/** Enough turns to push the live file past the rotation trigger. */
function fillPastBudget(dir: string, id: string): void {
  const turns = Math.ceil(ARCHIVE_TRIGGER_BYTES / (100 * KB)) + 2;
  for (let n = 1; n <= turns; n++) appendTurn(dir, id, n, 100);
}

function liveFile(dir: string, id: string): StoredConversation {
  return JSON.parse(
    readFileSync(join(dir, `${id}.json`), "utf8"),
  ) as StoredConversation;
}

describe("tailCutIndex", () => {
  const msg = (role: "user" | "assistant", size: number): ChatMessage => ({
    role,
    content: "y".repeat(size),
    ts: 1,
  });

  test("opens the tail at the user message of the newest turns that fit", () => {
    const messages = [
      msg("user", 10),
      msg("assistant", 500),
      msg("user", 10),
      msg("assistant", 500),
      msg("user", 10),
      msg("assistant", 100),
    ];
    // Serialized, the last turn is ~185 bytes and the one before ~585. An 800
    // byte tail holds both and opens at the user message at index 2; a 700
    // byte tail holds only the last turn, so the middle one is archived whole.
    expect(tailCutIndex(messages, 800)).toBe(2);
    expect(tailCutIndex(messages, 700)).toBe(4);
  });

  test("keeps the newest turn whole even when it alone exceeds the tail", () => {
    // Nothing fits, so the newest turn stays and nothing moves: a turn is
    // never split, and the live file is never left empty.
    const messages = [msg("user", 10), msg("assistant", 5000)];
    expect(tailCutIndex(messages, 100)).toBe(0);
    const two = [...messages, msg("user", 10), msg("assistant", 5000)];
    expect(tailCutIndex(two, 100)).toBe(2);
  });

  test("cuts nothing when everything fits", () => {
    expect(tailCutIndex([msg("user", 10), msg("assistant", 10)], 1000)).toBe(0);
  });
});

describe("rotation", () => {
  test("an append past the budget moves older turns into a segment and keeps the tail", () => {
    const dir = freshDir();
    fillPastBudget(dir, "r1");

    const live = liveFile(dir, "r1");
    // The tail plus whatever was appended after the rotating append.
    expect(statSync(join(dir, "r1.json")).size).toBeLessThan(
      ARCHIVE_TAIL_BYTES + 6 * 101 * KB,
    );
    expect(live.archived?.segments).toEqual([live.archived?.messages]);
    expect(live.messages[0]?.role).toBe("user"); // never split a turn
    expect(readdirSync(archiveDirFor(dir, "r1"))).toEqual(["1.json"]);

    // The transcript is intact: every message, in order, across both files.
    const full = loadFullConversation(dir, "r1");
    expect(full?.archived).toBeUndefined();
    const heads = full?.messages.map((m) =>
      m.content.split(" ").slice(0, 2).join(" "),
    );
    expect(heads).toEqual(
      Array.from({ length: (full?.messages.length ?? 0) / 2 }, (_, i) => [
        `question ${i + 1}`,
        `reply ${i + 1}`,
      ]).flat(),
    );
  });

  test("history paging is absolute across the segment boundary", () => {
    const dir = freshDir();
    fillPastBudget(dir, "r2");
    const conv = loadConversation(dir, "r2");
    if (!conv?.archived) throw new Error("expected a rotated conversation");
    const total = totalMessageCount(conv);
    const boundary = conv.archived.messages;

    const all = getHistoryAt(dir, "r2");
    expect(all?.totalMessages).toBe(total);
    expect(all?.messages).toHaveLength(total);

    // A page straddling the boundary: two from the segment, two from the tail.
    const page = getHistoryAt(dir, "r2", { before: boundary + 2, limit: 4 });
    expect(page?.offset).toBe(boundary - 2);
    expect(page?.messages.map((m) => m.content.slice(0, 10))).toEqual(
      all?.messages
        .slice(boundary - 2, boundary + 2)
        .map((m) => m.content.slice(0, 10)),
    );

    // The oldest page comes entirely from the segment.
    const first = getHistoryAt(dir, "r2", { before: 3, limit: 3 });
    expect(first?.messages.map((m) => m.content.slice(0, 10))).toEqual([
      "question 1",
      "reply 1 xx",
      "question 2",
    ]);
  });

  test("a second rotation adds segment 2 and the index accumulates", () => {
    const dir = freshDir();
    fillPastBudget(dir, "r3");
    const after1 = liveFile(dir, "r3");
    fillPastBudget(dir, "r3");
    const after2 = liveFile(dir, "r3");

    expect(after2.archived?.segments).toHaveLength(2);
    expect(after2.archived?.segments[0]).toBe(after1.archived?.segments[0]);
    expect(after2.archived?.messages).toBe(
      (after2.archived?.segments ?? []).reduce((a, b) => a + b, 0),
    );
    expect(readdirSync(archiveDirFor(dir, "r3")).sort()).toEqual([
      "1.json",
      "2.json",
    ]);
    expect(getHistoryAt(dir, "r3")?.messages).toHaveLength(
      totalMessageCount(after2),
    );
  });

  test("the conversation list still sees one conversation, not its segments", () => {
    const dir = freshDir();
    fillPastBudget(dir, "r4");
    expect(listConversationsAt(dir).map((c) => c.id)).toEqual(["r4"]);
  });

  test("a user append reports the ABSOLUTE expected count", () => {
    const dir = freshDir();
    fillPastBudget(dir, "r5");
    const before = totalMessageCount(
      loadConversation(dir, "r5") as StoredConversation,
    );
    const { expectedCount } = appendUserMessageAt(dir, "r5", "one more", {
      turnId: "tail",
    });
    expect(expectedCount).toBe(before);
  });
});

describe("edit-and-resend into a segment", () => {
  test("restores the segment's earlier messages as the tail and drops the rest", () => {
    const dir = freshDir();
    fillPastBudget(dir, "e1");
    const totalBefore = totalMessageCount(
      loadConversation(dir, "e1") as StoredConversation,
    );

    // Turn 2 is deep in segment 1.
    const cut = truncateConversationMutationAt(dir, "e1", "t2");
    expect(cut?.removed).toBe(totalBefore - 2);

    const conv = loadConversation(dir, "e1");
    expect(conv?.archived).toBeUndefined();
    expect(conv?.messages.map((m) => m.content.slice(0, 10))).toEqual([
      "question 1",
      "reply 1 xx",
    ]);
    expect(conv?.needsSessionReplay).toBe(true);
    expect(existsSync(archiveDirFor(dir, "e1"))).toBe(true);
    expect(readdirSync(archiveDirFor(dir, "e1"))).toEqual([]);
  });

  test("an unknown turn still writes nothing", () => {
    const dir = freshDir();
    fillPastBudget(dir, "e2");
    expect(truncateConversationMutationAt(dir, "e2", "nope")).toBeNull();
  });
});

describe("straggler and delete", () => {
  test("an oversized file written outside save rotates on first load", () => {
    const dir = freshDir();
    const messages: ChatMessage[] = [];
    for (let n = 1; n <= 100; n++) {
      messages.push(
        { role: "user", content: `q${n}`, ts: n, turnId: `t${n}` },
        {
          role: "assistant",
          content: "z".repeat(100 * KB),
          ts: n,
          turnId: `t${n}`,
        },
      );
    }
    const conv: StoredConversation = {
      id: "s1",
      title: "old",
      createdAt: 1,
      updatedAt: 1,
      messages,
    };
    writeFileSync(join(dir, "s1.json"), JSON.stringify(conv));

    const loaded = loadConversation(dir, "s1");
    expect(loaded?.archived).toBeDefined();
    expect(statSync(join(dir, "s1.json")).size).toBeLessThan(
      ARCHIVE_TAIL_BYTES + 128 * KB,
    );
    expect(getHistoryAt(dir, "s1")?.totalMessages).toBe(200);
  });

  test("deleting the conversation removes its segments", () => {
    const dir = freshDir();
    fillPastBudget(dir, "d1");
    expect(existsSync(archiveDirFor(dir, "d1"))).toBe(true);
    expect(deleteConversationAt(dir, "d1")).toBe(true);
    expect(existsSync(archiveDirFor(dir, "d1"))).toBe(false);
    expect(getHistoryAt(dir, "d1")).toBeNull();
  });
});
