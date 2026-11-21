import { expect, test } from "vitest";
import { mergeKeyedArrays } from "./keyed-merge";

const r = (id: string, fields: Record<string, unknown> = {}) => ({
  id,
  prompt: "p",
  enabled: true,
  updated_at: "2026-09-01T00:00:00.000Z",
  ...fields,
});

const LATER = "2026-10-01T00:00:00.000Z";
const LATEST = "2026-10-02T00:00:00.000Z";

test("an entry the writer left untouched takes the remote's edit", () => {
  const base = [r("a"), r("b")];
  const local = [r("a"), r("b", { prompt: "mine", updated_at: LATER })];
  const remote = [r("a", { prompt: "theirs", updated_at: LATER }), r("b")];

  expect(mergeKeyedArrays(remote, local, "id", base)).toEqual([
    r("a", { prompt: "theirs", updated_at: LATER }),
    r("b", { prompt: "mine", updated_at: LATER }),
  ]);
});

test("an entry either side deleted stays deleted, even if the other edited it", () => {
  const base = [r("a"), r("b")];
  const local = [r("b", { prompt: "edited", updated_at: LATER })];
  const remote = [r("a", { enabled: false, updated_at: LATER })];

  expect(mergeKeyedArrays(remote, local, "id", base)).toEqual([]);
});

test("entries new on either side both survive", () => {
  const base = [r("a")];
  expect(
    mergeKeyedArrays([r("a"), r("x")], [r("a"), r("y")], "id", base),
  ).toEqual([r("x"), r("a"), r("y")]);
});

test("an entry both sides changed goes whole to the newer side, never a mix", () => {
  const base = [r("a", { schedule: "0 9 * * *" })];
  const local = [
    r("a", {
      trigger: { kind: "webhook" },
      schedule: undefined,
      updated_at: LATER,
    }),
  ];
  const remote = [r("a", { schedule: "0 10 * * *", updated_at: LATEST })];

  expect(mergeKeyedArrays(remote, local, "id", base)).toEqual(remote);
  expect(mergeKeyedArrays(remote, local, "id", base)[0]).not.toHaveProperty(
    "trigger",
  );
});

test("without a base the union survives and a newer remote copy wins", () => {
  const local = [r("a"), r("b", { prompt: "mine" })];
  const remote = [r("a", { prompt: "theirs", updated_at: LATER }), r("c")];

  expect(mergeKeyedArrays(remote, local, "id")).toEqual([
    r("c"),
    r("a", { prompt: "theirs", updated_at: LATER }),
    r("b", { prompt: "mine" }),
  ]);
});

test("without a base or a later remote stamp the local copy wins, as before", () => {
  const local = [{ slug: "s", name: "Local" }];
  const remote = [
    { slug: "r", name: "Remote" },
    { slug: "s", name: "Stale" },
  ];

  expect(mergeKeyedArrays(remote, local, "slug")).toEqual([
    { slug: "r", name: "Remote" },
    { slug: "s", name: "Local" },
  ]);
});
