import { expect, test } from "vitest";
import {
  escapeControlCharsInStrings,
  escapeStrayQuotesInStrings,
  firstJsonValueEnd,
  salvageJsonDoc,
  salvageLeadingJson,
} from "./json-salvage";
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

test("escapeControlCharsInStrings re-escapes raw control characters inside strings only", () => {
  // The wild shape (HOUSTON-APP-5D6): an in-place edit of a long prompt left a
  // literal tab and newline inside the string literal.
  const raw = '[{"id":"r1","prompt":"Line one\nLine\ttwo \u0001 end"}]\n';
  const fixed = escapeControlCharsInStrings(raw);
  expect(fixed).toBe(
    '[{"id":"r1","prompt":"Line one\\nLine\\ttwo \\u0001 end"}]\n',
  );
  expect(JSON.parse(fixed as string)).toEqual([
    { id: "r1", prompt: "Line one\nLine\ttwo \u0001 end" },
  ]);
  // Already-clean text (whitespace between tokens is legal) is left alone.
  expect(escapeControlCharsInStrings(doc)).toBeUndefined();
  // `\"` inside a string never closes it early, so the newline after it is
  // still recognised as inside the string.
  expect(escapeControlCharsInStrings('{"a":"x\\"\ny"}')).toBe(
    '{"a":"x\\"\\ny"}',
  );
  // A control character between tokens is a real syntax error, not ours.
  expect(escapeControlCharsInStrings('{"a":\u00011}')).toBeUndefined();
});

test("salvageJsonDoc repairs raw control characters, then trailing junk", () => {
  const rawNewline = '[{"id":"r1","prompt":"a\nb"}]\n';
  expect(salvageJsonDoc(rawNewline)).toEqual([{ id: "r1", prompt: "a\nb" }]);
  // Both shapes at once: an appended partial copy of a doc with a raw tab.
  const rawTab = '[{"id":"r1","prompt":"a\tb"}]\n';
  expect(salvageJsonDoc(`${rawTab}${rawTab.slice(0, 12)}`)).toEqual([
    { id: "r1", prompt: "a\tb" },
  ]);
  expect(salvageJsonDoc(`${doc}]}`)).toEqual([routine]);
  // Mangled beyond a lossless repair: the caller keeps its throw.
  expect(salvageJsonDoc('[{"id":"r1","prompt":"a\nb"}')).toBeUndefined();
  expect(salvageJsonDoc("{oops")).toBeUndefined();
});

test("loadRoutines survives a raw newline inside a prompt (HOUSTON-APP-5D6)", async () => {
  const store = memStore();
  const key = `${ROOT}/.houston/routines/routines.json`;
  const edited = {
    ...routine,
    prompt: "Every morning:\n- check mail\n\t- reply",
  };
  // A hand edit that pasted the multi-line prompt in raw.
  await store.writeText(
    key,
    JSON.stringify([edited], null, 2).replace(
      JSON.stringify(edited.prompt),
      `"${edited.prompt}"`,
    ),
  );
  const { items, diagnostics } = await loadRoutines(store, ROOT);
  expect(items.map((r) => r.prompt)).toEqual([edited.prompt]);
  expect(diagnostics).toEqual([]);
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

// The wild shape behind a routines file that stopped one agent's routines
// for a day and a half: a prompt pasted in place with a raw newline AND a
// quoted word. The control-character pass alone left the quote to end the
// string early; the quote pass finishes the repair.
const strayQuoted = `[
  {
    "id": "r1",
    "name": "Daily digest",
    "prompt": "Delete mail from:\\n   - nemu@shop.example.com
   - anything that contains "Temu" in the sender name or domain (removed)",
    "schedule": "0 9 * * *"
  }
]
`;

test("escapeStrayQuotesInStrings escapes a quote that cannot end the string and leaves real terminators alone", () => {
  expect(escapeStrayQuotesInStrings(doc)).toBeUndefined();
  const fixed = escapeStrayQuotesInStrings('{"p": "say "hi" now", "k": 1}');
  expect(fixed).toBe('{"p": "say \\"hi\\" now", "k": 1}');
  expect(JSON.parse(fixed as string)).toEqual({ p: 'say "hi" now', k: 1 });
  // A stray quote right before a comma reads as a terminator: the text
  // after it is junk the grammar cannot place, so the parse still fails
  // instead of guessing.
  const ambiguous = escapeStrayQuotesInStrings('{"p": "say "hi", now"}');
  expect(ambiguous).toBe('{"p": "say \\"hi", now"}');
  expect(() => JSON.parse(ambiguous as string)).toThrow();
});

test("salvageJsonDoc repairs a raw newline and stray quotes in the same prompt", () => {
  const value = salvageJsonDoc(strayQuoted) as Array<{ prompt: string }>;
  expect(value).toHaveLength(1);
  expect(value[0]?.prompt).toBe(
    'Delete mail from:\n   - nemu@shop.example.com\n   - anything that contains "Temu" in the sender name or domain (removed)',
  );
});

test("loadRoutines reads the stray-quote file and keeps the schedule", async () => {
  const store = memStore();
  await store.writeText(`${ROOT}/.houston/routines/routines.json`, strayQuoted);
  const { items, diagnostics } = await loadRoutines(store, ROOT);
  expect(items.map((r) => [r.id, r.schedule])).toEqual([["r1", "0 9 * * *"]]);
  expect(items[0]?.prompt).toContain('"Temu"');
  expect(diagnostics).toEqual([]);
});
