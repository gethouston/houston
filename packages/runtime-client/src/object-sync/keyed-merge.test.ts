import { expect, test } from "vitest";
import { archivedLearning, mergeKeyedArrays } from "./keyed-merge";
import { mergeDocumentBodies } from "./sync-back-doc-merge";

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
  // One side moved the routine from its schedule to a trigger, the other
  // changed the schedule later. A field mix would carry both wake mechanisms,
  // which the routine reader drops, so the whole newer entry lands.
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

test("a memory archived locally stays archived while both sides' new memories survive", () => {
  // Learnings carry no updated_at: consolidation archives in place, so the
  // three-way base is what tells the local archive edit from a stale copy.
  const l = (id: string, fields: Record<string, unknown> = {}) => ({
    id,
    text: `memory ${id}`,
    created_at: "2026-09-01T00:00:00.000Z",
    ...fields,
  });
  const archivedA = l("A", { archived_at: LATER, replaced_by: "D" });
  const base = [l("A")];
  const local = [archivedA, l("D")];
  const remote = [l("A"), l("E")];

  expect(mergeKeyedArrays(remote, local, "id", base)).toEqual([
    l("E"),
    archivedA,
    l("D"),
  ]);
});

const mem = (id: string, fields: Record<string, unknown> = {}) => ({
  id,
  text: `memory ${id}`,
  created_at: "2026-09-01T00:00:00.000Z",
  ...fields,
});
const archived = mem("A", { archived_at: LATER, replaced_by: "B" });

test("without a base, a stale active copy never resurrects an archived memory", () => {
  // The standing pod's sync: local still holds A active, remote archived it.
  expect(
    mergeKeyedArrays([archived], [mem("A")], "id", undefined, archivedLearning),
  ).toEqual([archived]);
  // Either direction.
  expect(
    mergeKeyedArrays([mem("A")], [archived], "id", undefined, archivedLearning),
  ).toEqual([archived]);
});

test("when both sides changed a memory, the archived side wins over a text edit", () => {
  const base = [mem("A")];
  const local = [mem("A", { text: "edited" })];
  expect(
    mergeKeyedArrays([archived], local, "id", base, archivedLearning),
  ).toEqual([archived]);
});

test("archived wins only in the learnings document", () => {
  const body = (items: unknown[]) => `${JSON.stringify(items, null, 2)}\n`;
  const merge = (path: string) =>
    JSON.parse(
      mergeDocumentBodies(path, body([mem("A")]), body([archived])) ?? "[]",
    );
  expect(merge(".houston/learnings/learnings.json")).toEqual([archived]);
  // Routines keep the old rule: no stamps and no base, the local copy wins.
  expect(merge(".houston/routines/routines.json")).toEqual([mem("A")]);
});
