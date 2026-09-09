import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";

/**
 * The parse cache is bounded by BYTES: the sum of the cached files' on-disk
 * sizes never exceeds the budget, the least-recently-read transcript goes
 * first, a file that alone exceeds the budget is parsed for its caller and
 * never retained, and the list route's summary survives independently so an
 * over-budget transcript is not re-parsed on every list.
 *
 * The budget is pinned tiny via env BEFORE the module graph loads — config
 * reads env at import.
 */
process.env.HOUSTON_DATA_DIR = mkdtempSync(join(tmpdir(), "houston-pc-data-"));
process.env.HOUSTON_WORKSPACE_DIR = mkdtempSync(
  join(tmpdir(), "houston-pc-ws-"),
);
process.env.HOUSTON_CONVERSATION_PARSE_CACHE_MB = "0.001"; // 1048 bytes

const { listConversationsAt } = await import("./conversation-queries");
const { dropParsedFile, parseCacheStats, readParsedFile, readParsedSummary } =
  await import("./conversation-parse-cache");

const BUDGET = 0.001 * 1024 * 1024;

/** A conversation file whose on-disk size is about `bytes`. */
function writeConv(dir: string, id: string, bytes: number): string {
  const f = join(dir, `${id}.json`);
  const base = {
    id,
    title: id,
    createdAt: 1,
    updatedAt: 1,
    messages: [{ role: "user", content: "", ts: 1 }],
  };
  const pad = Math.max(0, bytes - JSON.stringify(base).length);
  base.messages[0].content = "x".repeat(pad);
  writeFileSync(f, JSON.stringify(base));
  return f;
}

const freshDir = () => mkdtempSync(join(tmpdir(), "houston-parse-cache-"));

test("the sum of cached file bytes stays under budget, oldest read evicted first", () => {
  const dir = freshDir();
  const a = writeConv(dir, "a", 400);
  const b = writeConv(dir, "b", 400);
  const c = writeConv(dir, "c", 400);

  const parsedA = readParsedFile(a);
  const parsedB = readParsedFile(b);
  expect(parsedA?.id).toBe("a");
  expect(parsedB?.id).toBe("b");
  // Two 400-byte files fit the 1048-byte budget together (a stat-hit returns
  // the same reference and keeps `b` the most recent); a third does not.
  expect(readParsedFile(b)).toBe(parsedB);
  expect(parseCacheStats()).toMatchObject({ entries: 2 });
  expect(parseCacheStats().bytes).toBeLessThanOrEqual(BUDGET);

  const parsedC = readParsedFile(c);
  expect(parsedC?.id).toBe("c");
  expect(parseCacheStats()).toMatchObject({ entries: 2 });
  expect(parseCacheStats().bytes).toBeLessThanOrEqual(BUDGET);
  // `c` (most recent) and `b` stayed; `a` (least recent) was evicted and a
  // re-read is a fresh parse.
  expect(readParsedFile(c)).toBe(parsedC);
  expect(readParsedFile(b)).toBe(parsedB);
  expect(readParsedFile(a)).not.toBe(parsedA);
});

test("a file over the whole budget is parsed for the caller, never retained", () => {
  const dir = freshDir();
  const big = writeConv(dir, "big", 4000);
  const before = parseCacheStats();

  const first = readParsedFile(big);
  expect(first?.id).toBe("big");
  expect(parseCacheStats().entries).toBe(before.entries);
  expect(parseCacheStats().bytes).toBe(before.bytes);
  // Every read is a fresh parse (no stale reference either).
  expect(readParsedFile(big)).not.toBe(first);
});

test("the list summary is cached apart from the transcript, even over budget", () => {
  const dir = freshDir();
  const big = writeConv(dir, "big", 4000);
  const before = parseCacheStats();
  let derived = 0;
  const derive = (conv: { id: string }) => {
    derived += 1;
    return conv.id;
  };

  expect(readParsedSummary(big, derive)).toBe("big");
  expect(readParsedSummary(big, derive)).toBe("big");
  expect(derived).toBe(1); // second call was a stat-hit on the summary
  expect(parseCacheStats().entries).toBe(before.entries);
  expect(parseCacheStats().summaries).toBe(before.summaries + 1);

  // A rewrite (new size) invalidates the summary; a drop forgets it.
  writeConv(dir, "big", 4100);
  expect(readParsedSummary(big, derive)).toBe("big");
  expect(derived).toBe(2);
  dropParsedFile(big);
  expect(readParsedSummary(big, derive)).toBe("big");
  expect(derived).toBe(3);
});

test("listConversationsAt lists an over-budget transcript without keeping it", () => {
  const dir = freshDir();
  writeConv(dir, "small", 200);
  writeConv(dir, "huge", 5000);

  const listed = listConversationsAt(dir).map((c) => c.id);
  expect(listed).toEqual(expect.arrayContaining(["small", "huge"]));
  expect(listed).toHaveLength(2);
  expect(parseCacheStats().bytes).toBeLessThanOrEqual(BUDGET);
  expect(listConversationsAt(dir)).toHaveLength(2);
});
