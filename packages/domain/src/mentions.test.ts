import { ACTIVITY_MENTIONS_MAX, type Activity } from "@houston/protocol";
import { expect, test } from "vitest";
import { normalizeActivities } from "./activities";
import { sanitizeMentions, upsertMentions } from "./mentions";

/**
 * The per-mission @mention aggregate (HOU-945): latest-per-person, capped,
 * never a log. Stamped host-side under a gateway-verified acting identity, so
 * these helpers stay pure — caller supplies the clock and the author.
 */

const NOW = "2026-07-27T10:00:00.000Z";
const LATER = "2026-07-27T11:00:00.000Z";

const mission = (mentioned?: Activity["mentioned"]): Activity => ({
  id: "m1",
  title: "Ship it",
  description: "",
  status: "running",
  ...(mentioned !== undefined ? { mentioned } : {}),
});

test("upsertMentions records new people with the instant and the author", () => {
  const next = upsertMentions(mission(), ["u-ada", "u-grace"], NOW, "u-alan");
  expect(next.mentioned).toEqual([
    { user_id: "u-ada", at: NOW, by: "u-alan" },
    { user_id: "u-grace", at: NOW, by: "u-alan" },
  ]);
});

test("upsertMentions omits `by` when the author is unknown", () => {
  const next = upsertMentions(mission(), ["u-ada"], NOW);
  expect(next.mentioned).toEqual([{ user_id: "u-ada", at: NOW }]);
  expect("by" in (next.mentioned?.[0] ?? {})).toBe(false);
});

test("upsertMentions dedupes ids within one call", () => {
  const next = upsertMentions(mission(), ["u-ada", "u-ada", "u-ada"], NOW);
  expect(next.mentioned).toEqual([{ user_id: "u-ada", at: NOW }]);
});

test("upsertMentions drops non-string and empty ids", () => {
  const next = upsertMentions(
    mission(),
    ["u-ada", "", null as unknown as string, 7 as unknown as string],
    NOW,
  );
  expect(next.mentioned).toEqual([{ user_id: "u-ada", at: NOW }]);
});

test("a later mention overwrites the earlier one in place (latest wins)", () => {
  const first = upsertMentions(mission(), ["u-ada", "u-grace"], NOW, "u-alan");
  const second = upsertMentions(first, ["u-ada"], LATER, "u-edsger");
  // One entry per person, same position — the aggregate is not a log.
  expect(second.mentioned).toEqual([
    { user_id: "u-ada", at: LATER, by: "u-edsger" },
    { user_id: "u-grace", at: NOW, by: "u-alan" },
  ]);
});

test("upsertMentions returns the SAME reference when nothing changed", () => {
  const empty = mission();
  expect(upsertMentions(empty, [], NOW)).toBe(empty);
  expect(upsertMentions(empty, ["", ""], NOW)).toBe(empty);
  const one = upsertMentions(empty, ["u-ada"], NOW, "u-alan");
  // Re-stamping the same person at the same instant by the same author is a
  // no-op, so the caller skips the disk write.
  expect(upsertMentions(one, ["u-ada"], NOW, "u-alan")).toBe(one);
});

test("upsertMentions never touches updated_at", () => {
  const before: Activity = { ...mission(), updated_at: NOW };
  const next = upsertMentions(before, ["u-ada"], LATER);
  expect(next.updated_at).toBe(NOW);
});

test("the aggregate is capped, dropping the OLDEST `at` first", () => {
  let a = mission();
  // ACTIVITY_MENTIONS_MAX people, each at a distinct (increasing) instant.
  for (let i = 0; i < ACTIVITY_MENTIONS_MAX; i++) {
    a = upsertMentions(
      a,
      [`u-${i}`],
      `2026-07-27T00:${String(i).padStart(2, "0")}:00.000Z`,
    );
  }
  expect(a.mentioned).toHaveLength(ACTIVITY_MENTIONS_MAX);
  const capped = upsertMentions(a, ["u-new"], LATER);
  expect(capped.mentioned).toHaveLength(ACTIVITY_MENTIONS_MAX);
  // `u-0` was the oldest instant, so it is the one that fell off.
  expect(capped.mentioned?.some((m) => m.user_id === "u-0")).toBe(false);
  expect(capped.mentioned?.some((m) => m.user_id === "u-1")).toBe(true);
  expect(capped.mentioned?.at(-1)).toEqual({ user_id: "u-new", at: LATER });
});

test("sanitizeMentions keeps only well-formed entries", () => {
  expect(
    sanitizeMentions([
      { user_id: "u-ada", at: NOW, by: "u-alan" },
      { user_id: "u-grace", at: NOW },
      { user_id: "u-bad", at: 7 },
      { user_id: "", at: NOW },
      { at: NOW },
      { user_id: "u-name", at: NOW, by: 42 },
      null,
      "nope",
      [],
    ]),
  ).toEqual([
    { user_id: "u-ada", at: NOW, by: "u-alan" },
    { user_id: "u-grace", at: NOW },
    { user_id: "u-name", at: NOW },
  ]);
});

test("sanitizeMentions dedupes by user_id and returns undefined for nothing", () => {
  expect(
    sanitizeMentions([
      { user_id: "u-ada", at: NOW },
      { user_id: "u-ada", at: LATER },
    ]),
  ).toEqual([{ user_id: "u-ada", at: NOW }]);
  expect(sanitizeMentions(undefined)).toBeUndefined();
  expect(sanitizeMentions("garbage")).toBeUndefined();
  expect(sanitizeMentions([])).toBeUndefined();
  expect(sanitizeMentions([{ nope: true }])).toBeUndefined();
});

test("sanitizeMentions caps a hostile on-disk list", () => {
  const many = Array.from({ length: ACTIVITY_MENTIONS_MAX + 10 }, (_, i) => ({
    user_id: `u-${i}`,
    at: NOW,
  }));
  expect(sanitizeMentions(many)).toHaveLength(ACTIVITY_MENTIONS_MAX);
});

/** An entry at minute `i` of the same hour — distinct, increasing instants. */
const atMinute = (i: number) =>
  `2026-07-27T00:${String(i).padStart(2, "0")}:00.000Z`;

test("sanitizeMentions keeps the NEWEST entries over the cap, not the first ones in the file", () => {
  // Oldest first in file order, so "keep the first MAX" and "keep the newest
  // MAX" disagree: the read must drop the leading (oldest) 10, matching what a
  // write would have dropped.
  const oldestFirst = Array.from(
    { length: ACTIVITY_MENTIONS_MAX + 10 },
    (_, i) => ({ user_id: `u-${i}`, at: atMinute(i) }),
  );
  expect(sanitizeMentions(oldestFirst)).toEqual(oldestFirst.slice(10));

  // Recency scattered through the file: the survivor set is chosen by `at`
  // alone, and the survivors come back in FILE order (never reshuffled).
  const scattered = Array.from(
    { length: ACTIVITY_MENTIONS_MAX + 10 },
    (_, i) => ({ user_id: `u-${i}`, at: atMinute((i * 17) % 42) }),
  );
  expect(sanitizeMentions(scattered)).toEqual(
    scattered.filter((m) => m.at >= atMinute(10)),
  );
});

test("sanitizeMentions breaks `at` ties by file order, deterministically", () => {
  // Every entry at the SAME instant: nothing is newer, so the cap has to fall
  // back on file order — and must land on the same survivors every run.
  const tied = Array.from({ length: ACTIVITY_MENTIONS_MAX + 2 }, (_, i) => ({
    user_id: `u-${i}`,
    at: NOW,
  }));
  expect(sanitizeMentions(tied)).toEqual(tied.slice(0, ACTIVITY_MENTIONS_MAX));

  // A tie at the cap boundary: 2 newest, then MAX tied older entries. The two
  // newest survive outright; the tie fills the remaining slots from the top of
  // the file, and every survivor keeps its file position.
  const boundary = [
    { user_id: "u-new-a", at: LATER },
    ...Array.from({ length: ACTIVITY_MENTIONS_MAX }, (_, i) => ({
      user_id: `u-tied-${i}`,
      at: NOW,
    })),
    { user_id: "u-new-b", at: LATER },
  ];
  expect(sanitizeMentions(boundary)?.map((m) => m.user_id)).toEqual([
    "u-new-a",
    ...Array.from(
      { length: ACTIVITY_MENTIONS_MAX - 2 },
      (_, i) => `u-tied-${i}`,
    ),
    "u-new-b",
  ]);
});

test("normalizeActivities sanitizes `mentioned` and deletes it when empty", () => {
  const { items } = normalizeActivities(
    [
      {
        id: "m1",
        title: "Kept",
        status: "running",
        mentioned: [{ user_id: "u-ada", at: NOW }, { at: NOW }],
      },
      { id: "m2", title: "Garbage", status: "running", mentioned: "nope" },
      { id: "m3", title: "Empty", status: "running", mentioned: [] },
    ],
    "k",
  );
  expect(items[0]?.mentioned).toEqual([{ user_id: "u-ada", at: NOW }]);
  expect("mentioned" in (items[1] ?? {})).toBe(false);
  expect("mentioned" in (items[2] ?? {})).toBe(false);
});
