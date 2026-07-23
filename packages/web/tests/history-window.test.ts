import { expect, test } from "vitest";
import { decideServerSeed } from "../src/engine-adapter/history-window";

/**
 * The windowed-seed decision (HOU-819): a server TAIL can be shorter than the
 * on-screen feed yet strictly newer (teammate turns landed while the chat was
 * closed and cache-painted), so recency — the last message's `ts` — decides,
 * with the historical richer-wins length guard as the no-timestamp fallback.
 */

const at = (ts: number) => ({ ts });
const noTs = () => ({}) as { ts?: number };

test("an empty feed is always seeded", () => {
  expect(decideServerSeed([], [at(10)])).toBe("replace");
});

test("an empty fold never blanks a painted feed", () => {
  expect(decideServerSeed([at(10)], [])).toBe("skip");
});

test("a newer tail replaces a longer, older feed (the stale-cache case)", () => {
  expect(decideServerSeed([at(1), at(2), at(3)], [at(2), at(9)])).toBe(
    "replace",
  );
});

test("an older fold never replaces a newer feed (the raced-read case)", () => {
  expect(decideServerSeed([at(5), at(9)], [at(5)])).toBe("skip");
});

test("identical content (same last ts, same length) stamps without reseeding", () => {
  expect(decideServerSeed([at(1), at(9)], [at(1), at(9)])).toBe("stamp");
});

test("same last message but a richer fold replaces (more of the transcript)", () => {
  expect(decideServerSeed([at(9)], [at(1), at(9)])).toBe("replace");
});

test("same last message but a poorer fold skips (no stamp — indices unknown)", () => {
  expect(decideServerSeed([at(1), at(2), at(9)], [at(9)])).toBe("skip");
});

test("no timestamps falls back to richer-wins; ties keep the current feed", () => {
  expect(decideServerSeed([noTs()], [noTs(), noTs()])).toBe("replace");
  expect(decideServerSeed([noTs(), noTs()], [noTs(), noTs()])).toBe("skip");
  expect(decideServerSeed([noTs(), noTs()], [noTs()])).toBe("skip");
});
