import { expect, test } from "vitest";
import { firstJsonValueEnd, salvageLeadingJson } from "./json-salvage";
import { loadRoutineRuns, loadRoutines } from "./routines";
import { loadJson, parseJsonDoc, type TextStore } from "./store";

const ROOT = "Personal/Slack Test";

function memStore(): TextStore {
  const m = new Map<string, string>();
  return {
    readText: async (k) => m.get(k) ?? null,
    writeText: async (k, v) => {
      m.set(k, v);
    },
  };
}

const routine = {
  id: "r1",
  name: "Daily digest",
  prompt: 'Summarize "everything" {with} [brackets] and a \\" quote',
  schedule: "0 9 * * *",
};
const doc = `${JSON.stringify([routine], null, 2)}\n`;

test("firstJsonValueEnd tracks nesting and string escapes", () => {
  expect(firstJsonValueEnd(doc)).toBe(doc.length - 1);
  expect(firstJsonValueEnd('  {"a":"]}"}tail')).toBe(12);
  expect(firstJsonValueEnd("[1, [2, 3]")).toBe(-1);
  expect(firstJsonValueEnd("42 junk")).toBe(-1);
  expect(firstJsonValueEnd("")).toBe(-1);
});

test("salvageLeadingJson keeps a complete value that has trailing junk", () => {
  // The wild shape: the full array followed by a second, partial copy of it.
  expect(salvageLeadingJson(`${doc}${doc.slice(0, 40)}`)).toEqual([routine]);
  expect(salvageLeadingJson(`${doc}]}`)).toEqual([routine]);
});

test("salvageLeadingJson refuses when nothing is cleanly recoverable", () => {
  expect(salvageLeadingJson(doc)).toBeUndefined();
  expect(salvageLeadingJson(`${doc}  `)).toBeUndefined();
  expect(salvageLeadingJson("{not json")).toBeUndefined();
  expect(salvageLeadingJson(doc.slice(0, -10))).toBeUndefined();
  expect(salvageLeadingJson('{"a": tru}xyz')).toBeUndefined();
});

test("loadRoutines survives trailing junk after the array (list_routines no longer 500s)", async () => {
  const store = memStore();
  const key = `${ROOT}/.houston/routines/routines.json`;
  await store.writeText(key, `${doc}${doc.slice(0, 60)}`);
  const { items, diagnostics } = await loadRoutines(store, ROOT);
  expect(items.map((r) => r.id)).toEqual(["r1"]);
  expect(diagnostics).toEqual([]);
  await store.writeText(
    `${ROOT}/.houston/routine_runs/routine_runs.json`,
    "[]\n]}garbage",
  );
  expect((await loadRoutineRuns(store, ROOT)).items).toEqual([]);
});

test("loadJson still throws on a mangled file, naming the key", async () => {
  const store = memStore();
  await store.writeText("k.json", '[{"id": "r1", ');
  await expect(loadJson(store, "k.json", [])).rejects.toThrow(
    "k.json is not valid JSON",
  );
  await store.writeText("k.json", "﻿[]\n");
  expect(await loadJson(store, "k.json", null)).toEqual([]);
});

test("parseJsonDoc strips a BOM, salvages trailing junk, and names the key", () => {
  expect(parseJsonDoc(`\uFEFF{"a":1}`, "config.json")).toEqual({ a: 1 });
  expect(parseJsonDoc('[{"id":"r1"}]junk after', "routines.json")).toEqual([
    { id: "r1" },
  ]);
  expect(() => parseJsonDoc("{oops", "learnings.json")).toThrow(
    /learnings\.json is not valid JSON/,
  );
});
