import {
  ASSISTANT_LEARNINGS_MAX_BYTES,
  jsonDoc,
  loadLearnings,
  saveLearnings,
  shortLearningIds,
} from "@houston/domain";
import type { Learning } from "@houston/protocol";
import { expect, test } from "vitest";
import { MemoryVfs } from "../vfs";
import { ASSISTANT_AGENT_NAME } from "./assistant";
import { boundedList } from "./learning-replace";
import { parseLearningSaveBody, parseReplaces } from "./learning-save-body";
import {
  ASSISTANT_LEARNINGS_FULL_MESSAGE,
  appendLearningChecked,
} from "./learning-write";

/**
 * Consolidation archives, never deletes: a save that names older memories in
 * `replaces` stamps them `archived_at` + `replaced_by` and appends the merged
 * one, all inside the doc lock. A bad ref refuses the whole save.
 */

const ROOT = "Personal/Helper";
const ASSISTANT_ROOT = `Personal/${ASSISTANT_AGENT_NAME}`;
const NOW = "2026-10-13T12:00:00.000Z";
const OLD = "2026-01-01T00:00:00.000Z";

const learning = (id: string, text: string): Learning => ({
  id,
  text,
  created_at: OLD,
});

const LISBON = learning(
  "aaaaaaaa-1111-4111-8111-111111111111",
  "Lives in Lisbon",
);
const MORNINGS = learning(
  "bbbbbbbb-2222-4222-8222-222222222222",
  "Prefers mornings",
);
const DOG = learning("bbbbbbbb-3333-4333-8333-333333333333", "Has a dog");
const SEEDED = [LISBON, MORNINGS, DOG];

async function seeded(root = ROOT, items = SEEDED) {
  const vfs = new MemoryVfs();
  await saveLearnings(vfs, root, items);
  return vfs;
}

const items = async (vfs: MemoryVfs, root = ROOT) =>
  (await loadLearnings(vfs, root)).items;

test("replaces by full id archives the old memory and appends the new one", async () => {
  const vfs = await seeded();
  const result = await appendLearningChecked(vfs, ROOT, {
    id: "new",
    text: "Lives in Porto",
    nowIso: NOW,
    replaces: [LISBON.id],
  });
  expect(result).toMatchObject({ learning: { id: "new" } });
  const after = await items(vfs);
  expect(after).toHaveLength(4);
  expect(after[0]).toEqual({
    ...LISBON,
    archived_at: NOW,
    replaced_by: "new",
  });
  expect(after[1]).toEqual(MORNINGS);
});

test("replaces by a unique 8+ char prefix resolves among active memories", async () => {
  const vfs = await seeded();
  await appendLearningChecked(vfs, ROOT, {
    id: "new",
    text: "Lives in Porto",
    nowIso: NOW,
    replaces: ["aaaaaaaa"],
  });
  expect((await items(vfs))[0]?.replaced_by).toBe("new");
});

test.each([
  ["unknown", ["cccccccc"], 'There is no memory "cccccccc"'],
  ["ambiguous", ["bbbbbbbb"], '"bbbbbbbb" in `replaces` matches more than one'],
  ["too short", ["aaaa"], 'There is no memory "aaaa"'],
])("an %s ref refuses the save and writes nothing", async (_name, replaces, message) => {
  const vfs = await seeded();
  const result = await appendLearningChecked(vfs, ROOT, {
    id: "new",
    text: "Lives in Porto",
    nowIso: NOW,
    replaces,
  });
  expect(result).toEqual({
    error: expect.stringContaining(message),
    code: "memory_replace_refused",
  });
  expect(await items(vfs)).toEqual(SEEDED);
});

test("an already-archived ref refuses the save and writes nothing", async () => {
  const archived = [
    { ...LISBON, archived_at: OLD, replaced_by: "x" },
    MORNINGS,
    DOG,
  ];
  const vfs = await seeded(ROOT, archived);
  for (const ref of [LISBON.id, "aaaaaaaa"]) {
    const result = await appendLearningChecked(vfs, ROOT, {
      id: "new",
      text: "Lives in Porto",
      nowIso: NOW,
      replaces: [ref],
    });
    expect(result).toEqual({
      error: expect.stringContaining("was already replaced"),
      code: "memory_replace_refused",
    });
  }
  expect(await items(vfs)).toEqual(archived);
});

test("a retried save with the same id returns the existing learning first", async () => {
  const vfs = await seeded();
  const input = {
    id: "new",
    text: "Lives in Porto",
    nowIso: NOW,
    replaces: [LISBON.id],
  };
  await appendLearningChecked(vfs, ROOT, input);
  // The retry's ref now names an archived memory; idempotency still wins.
  expect(await appendLearningChecked(vfs, ROOT, input)).toMatchObject({
    learning: { id: "new" },
  });
  expect(await items(vfs)).toHaveLength(4);
});

/** One active memory sized so the active doc is EXACTLY at the cap. */
function fullActive(id: string): Learning {
  const base = learning(id, "");
  const overhead = Buffer.byteLength(jsonDoc([base]), "utf8");
  return {
    ...base,
    text: "x".repeat(ASSISTANT_LEARNINGS_MAX_BYTES - overhead),
  };
}

test("the cap counts only active memories", async () => {
  const archived = {
    ...learning("old-archived", "y".repeat(ASSISTANT_LEARNINGS_MAX_BYTES)),
    archived_at: OLD,
    replaced_by: "z",
  };
  const vfs = await seeded(ASSISTANT_ROOT, [archived]);
  expect(
    await appendLearningChecked(vfs, ASSISTANT_ROOT, {
      id: "new",
      text: "Fits easily",
      nowIso: NOW,
    }),
  ).toMatchObject({ learning: { id: "new" } });
});

test("when full, the refusal lists active memories by short id; a shrinking consolidation passes", async () => {
  const full = fullActive("ffffffff-0000-4000-8000-000000000000");
  const vfs = await seeded(ASSISTANT_ROOT, [full]);
  const refused = await appendLearningChecked(vfs, ASSISTANT_ROOT, {
    id: "n1",
    text: "One more thing",
    nowIso: NOW,
  });
  expect(refused).toEqual({
    error: expect.stringContaining(ASSISTANT_LEARNINGS_FULL_MESSAGE),
    code: "memory_full",
  });
  const error = "error" in refused ? refused.error : "";
  expect(error).toContain("- [ffffffff] xxx");

  const merged = await appendLearningChecked(vfs, ASSISTANT_ROOT, {
    id: "n2",
    text: "Short merged memory",
    nowIso: NOW,
    replaces: ["ffffffff"],
  });
  expect(merged).toMatchObject({ learning: { id: "n2" } });
  expect((await items(vfs, ASSISTANT_ROOT)).map((l) => l.archived_at)).toEqual([
    NOW,
    undefined,
  ]);
});

test("short ids are the shortest unique prefix of at least 8 characters", () => {
  const short = shortLearningIds([
    learning("abcdefgh-1", ""),
    learning("abcdefgh-2", ""),
    learning("zzzzzzzzzz", ""),
    learning("tiny", ""),
  ]);
  expect([...short.values()]).toEqual([
    "abcdefgh-1",
    "abcdefgh-2",
    "zzzzzzzz",
    "tiny",
  ]);
});

test("parseReplaces accepts only up to 50 non-empty strings", () => {
  expect(parseReplaces({})).toEqual({});
  expect(parseReplaces({ replaces: [" a1b2c3d4 "] })).toEqual({
    replaces: ["a1b2c3d4"],
  });
  for (const bad of ["x", [""], [1], Array(51).fill("id")]) {
    expect(parseReplaces({ replaces: bad })).toHaveProperty("error");
  }
});

test("a lost-response retry of a consolidation (new id, same text) returns the first save", async () => {
  const vfs = await seeded();
  const first = await appendLearningChecked(vfs, ROOT, {
    id: "n1",
    text: "Lives in Porto",
    nowIso: NOW,
    replaces: ["aaaaaaaa"],
  });
  const before = await items(vfs);
  const retry = await appendLearningChecked(vfs, ROOT, {
    id: "n2",
    text: " Lives in Porto ",
    nowIso: NOW,
    replaces: ["aaaaaaaa"],
  });
  expect(retry).toEqual(first);
  expect(await items(vfs)).toEqual(before);

  // Different text is a real new save naming an archived memory: refused.
  expect(
    await appendLearningChecked(vfs, ROOT, {
      id: "n3",
      text: "Lives in Faro",
      nowIso: NOW,
      replaces: ["aaaaaaaa"],
    }),
  ).toMatchObject({ code: "memory_replace_refused" });
  expect(await items(vfs)).toEqual(before);
});

test("the listed memories are cut to about the cap, naming recall for the rest", () => {
  const many = Array.from({ length: 200 }, (_, i) =>
    learning(`id-${String(i).padStart(6, "0")}`, "y".repeat(100)),
  );
  const lines = boundedList(many);
  expect(Buffer.byteLength(lines.join("\n"), "utf8")).toBeLessThan(
    ASSISTANT_LEARNINGS_MAX_BYTES + 200,
  );
  expect(lines.length).toBeLessThan(200);
  expect(lines.at(-1)).toMatch(/more memories not listed.*houston_recall/);
  expect(boundedList(many.slice(0, 3))).toHaveLength(3);
});

test("a save body is parsed text first, then replaces, the same on every path", () => {
  expect(parseLearningSaveBody({ replaces: "bad" })).toEqual({
    error: "missing 'text'",
  });
  expect(parseLearningSaveBody({ text: " hi ", replaces: "bad" })).toEqual({
    error: expect.stringContaining("'replaces' must be an array"),
  });
  expect(parseLearningSaveBody({ text: " hi ", replaces: ["abc"] })).toEqual({
    text: "hi",
    replaces: ["abc"],
  });
});

test("the cap follows the coordinator ROLE, whatever the agent folder is named", async () => {
  // A managed pod or a pooled turn names the assistant like any other agent.
  const vfs = await seeded(ROOT, [
    fullActive("ffffffff-0000-4000-8000-000000000000"),
  ]);
  const input = { id: "n1", text: "One more thing", nowIso: NOW };
  expect(
    await appendLearningChecked(vfs, ROOT, { ...input, assistant: true }),
  ).toMatchObject({ code: "memory_full" });
  expect(await appendLearningChecked(vfs, ROOT, input)).toMatchObject({
    learning: { id: "n1" },
  });
});
