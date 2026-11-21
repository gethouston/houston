import {
  CACHE_FRAME_HARD_MAX,
  decideServerSeed,
  type SeedFrame,
  trimForCache,
} from "@houston/engine-adapter/history-window";
import { expect, test } from "vitest";

const user = (text: string): SeedFrame => ({
  feed_type: "user_message",
  data: text,
});
const reply = (text: string): SeedFrame => ({
  feed_type: "assistant_text",
  data: text,
});
const pendingUser = (text: string): SeedFrame => ({
  feed_type: "user_message",
  data: text,
  pending: true,
});

test("an empty feed is always seeded", () => {
  expect(decideServerSeed([], [user("hi")], false)).toBe("replace");
});

test("an empty fold never blanks a painted feed", () => {
  expect(decideServerSeed([user("hi")], [], false)).toBe("skip");
});

test("an unconfirmed optimistic send is never clobbered", () => {
  expect(
    decideServerSeed(
      [user("old"), reply("done"), pendingUser("parked send")],
      [user("old"), reply("done")],
      false,
    ),
  ).toBe("skip");
});

test("a tail containing newer turns replaces a stale cache paint", () => {
  expect(
    decideServerSeed(
      [user("t1"), reply("r1")],
      [user("t1"), reply("r1"), user("t2"), reply("r2")],
      false,
    ),
  ).toBe("replace");
});

test("a raced stale fold (feed's latest turn missing from it) is skipped", () => {
  expect(
    decideServerSeed(
      [user("t1"), reply("r1"), user("t2"), reply("r2")],
      [user("t1"), reply("r1")],
      false,
    ),
  ).toBe("skip");
});

test("same latest turn, fold carries its settled reply the feed lacks", () => {
  expect(decideServerSeed([user("t1")], [user("t1"), reply("r1")], false)).toBe(
    "replace",
  );
});

test("same latest turn, feed carries settled content the fold missed", () => {
  expect(decideServerSeed([user("t1"), reply("r1")], [user("t1")], false)).toBe(
    "skip",
  );
});

test("identical content stamps without reseeding (no id churn)", () => {
  expect(
    decideServerSeed(
      [user("t1"), reply("r1")],
      [user("t1"), reply("r1")],
      false,
    ),
  ).toBe("stamp");
});

test("different server content replaces a same-length cached fold", () => {
  const mission = {
    id: "m1",
    title: "Collect documents",
    agent: "Document Collector",
  };
  const before = [
    user("Onboarding complete"),
    { feed_type: "tool_result", data: { content: "Started", is_error: false } },
    reply("Done! Now you can see what they're doing."),
  ];
  const after = [
    before[0],
    {
      feed_type: "tool_result",
      data: { content: "Started", is_error: false, mission },
    },
    before[2],
  ];
  expect(decideServerSeed(before, after, false)).toBe("replace");
  expect(
    decideServerSeed(
      [user("same"), reply("draft")],
      [user("same"), reply("final")],
      false,
    ),
  ).toBe("replace");
  expect(decideServerSeed([reply("draft")], [reply("final")], false)).toBe(
    "replace",
  );
});

test("an UNSTAMPED longer cache paint is replaced by the authoritative window", () => {
  expect(
    decideServerSeed(
      [user("t0"), reply("r0"), user("t1"), reply("r1")],
      [user("t1"), reply("r1")],
      false,
    ),
  ).toBe("replace");
});

test("a STAMPED wider feed (loaded pages) survives a same-content tail refetch", () => {
  expect(
    decideServerSeed(
      [user("t0"), reply("r0"), user("t1"), reply("r1")],
      [user("t1"), reply("r1")],
      true,
    ),
  ).toBe("skip");
});

test("disjoint tails: the server window wins over an unowned ancient feed", () => {
  expect(
    decideServerSeed(
      [user("ancient"), reply("r")],
      [user("recent-a"), reply("ra"), user("recent-b"), reply("rb")],
      false,
    ),
  ).toBe("replace");
});

test("no user anchor on either side falls back to richer-wins", () => {
  expect(decideServerSeed([reply("a")], [reply("a"), reply("b")], false)).toBe(
    "replace",
  );
  expect(decideServerSeed([reply("a")], [reply("a")], false)).toBe("stamp");
});

test("trimForCache keeps a small feed untouched", () => {
  const frames = [user("t1"), reply("r1")];
  expect(trimForCache(frames, 10, 20)).toBe(frames);
});

test("trimForCache cuts at a turn boundary, never mid-turn", () => {
  const frames = [1, 2, 3].flatMap((n) => [
    user(`t${n}`),
    reply(`a${n}`),
    reply(`b${n}`),
    reply(`c${n}`),
  ]);
  const trimmed = trimForCache(frames, 6, 100);
  expect(trimmed[0]?.data).toBe("t2");
  expect(trimmed).toHaveLength(8);
});

test("trimForCache falls back to the hard ceiling on a single oversized turn", () => {
  const frames: SeedFrame[] = [
    user("t1"),
    ...Array.from({ length: CACHE_FRAME_HARD_MAX + 50 }, (_, i) =>
      reply(`tool ${i}`),
    ),
  ];
  const trimmed = trimForCache(frames);
  expect(trimmed.length).toBeLessThanOrEqual(CACHE_FRAME_HARD_MAX);
  expect(trimmed[0]?.feed_type).not.toBe("user_message");
});
