import { test, expect } from "bun:test";
import type { RoutineUpdate } from "@houston/protocol";
import type { TextStore } from "./store";
import { loadJson } from "./store";
import { docKey, schemaKey, seedSchemas } from "./layout";
import {
  applyActivityUpdate,
  createActivity,
  loadActivities,
  normalizeActivities,
  removeById,
  saveActivities,
  upsertById,
} from "./activities";
import {
  applyRoutineUpdate,
  createRoutine,
  loadRoutines,
  normalizeRoutines,
  saveRoutines,
} from "./routines";
import { loadConfig, loadLearnings, saveConfig } from "./config";

/** Tiny in-memory TextStore (the same shape the host's Vfs satisfies). */
function memStore(): TextStore & { dump(): Map<string, string> } {
  const m = new Map<string, string>();
  return {
    async readText(key) {
      return m.get(key) ?? null;
    },
    async writeText(key, content) {
      m.set(key, content);
    },
    dump: () => m,
  };
}

const ROOT = "ws/w1/a1/workspace";
const NOW = "2026-06-12T12:00:00.000Z";

test("activities round-trip: create → save → load, pretty-printed on disk", async () => {
  const store = memStore();
  const a = createActivity(
    { title: "Build deck", description: "Q2" },
    "act-1",
    NOW,
  );
  await saveActivities(store, ROOT, [a]);

  const { items, diagnostics } = await loadActivities(store, ROOT);
  expect(items).toEqual([a]);
  expect(diagnostics).toEqual([]);
  expect(items[0]!.status).toBe("running");

  // files-first: the on-disk doc is human/agent-readable (pretty, trailing newline)
  const raw = store.dump().get(docKey(ROOT, "activity"))!;
  expect(raw.endsWith("\n")).toBe(true);
  expect(raw).toContain("\n  ");
});

test("agent-written junk: malformed entries drop with diagnostics, good ones survive", async () => {
  const store = memStore();
  await store.writeText(
    docKey(ROOT, "activity"),
    JSON.stringify([
      { id: "ok-1", title: "Fine", description: "", status: "done" },
      { title: "no id" },
      "not even an object",
      {
        id: "ok-2",
        title: "Also fine",
        status: "future_status",
        description: "",
      },
    ]),
  );
  const { items, diagnostics } = await loadActivities(store, ROOT);
  expect(items.map((a) => a.id)).toEqual(["ok-1", "ok-2"]);
  expect(items[1]!.status).toBe("future_status"); // unknown status preserved, not dropped
  expect(diagnostics).toHaveLength(2);
});

test("a file that exists but is not JSON throws with the key named (never silent reset)", async () => {
  const store = memStore();
  await store.writeText(docKey(ROOT, "activity"), "{ broken");
  await expect(loadActivities(store, ROOT)).rejects.toThrow(
    docKey(ROOT, "activity"),
  );
});

test("activity update: undefined leaves fields alone, updated_at bumps", () => {
  const a = createActivity({ title: "T" }, "a1", "2026-01-01T00:00:00.000Z");
  const next = applyActivityUpdate(a, { status: "done" }, NOW);
  expect(next.status).toBe("done");
  expect(next.title).toBe("T");
  expect(next.updated_at).toBe(NOW);
});

test("upsert/remove by id", () => {
  const a = createActivity({ title: "A" }, "a", NOW);
  const b = createActivity({ title: "B" }, "b", NOW);
  let items = upsertById(upsertById([], a), b);
  items = upsertById(items, { ...a, title: "A2" });
  expect(items.map((x) => x.title)).toEqual(["A2", "B"]);

  const removed = removeById(items, "a");
  expect(removed.removed).toBe(true);
  expect(removed.items.map((x) => x.id)).toEqual(["b"]);
  expect(removeById(removed.items, "ghost").removed).toBe(false);
});

test("routines: schema defaults applied on create and on read of sparse entries", async () => {
  const store = memStore();
  const r = createRoutine(
    { name: "Daily", prompt: "Do it", schedule: "0 9 * * 1-5" },
    "r1",
    NOW,
  );
  expect(r.enabled).toBe(true);
  expect(r.chat_mode).toBe("shared");
  expect(r.integrations).toEqual([]);
  // No pin given → provider/model/effort are null (inherit the agent default).
  expect(r.provider).toBeNull();
  expect(r.model).toBeNull();
  expect(r.effort).toBeNull();
  await saveRoutines(store, ROOT, [r]);

  // A sparse, hand-written entry gains defaults on read.
  await store.writeText(
    docKey(ROOT, "routines"),
    JSON.stringify([
      { id: "r2", name: "Sparse", prompt: "p", schedule: "0 8 * * *" },
    ]),
  );
  const { items } = await loadRoutines(store, ROOT);
  expect(items[0]!.enabled).toBe(true);
  expect(items[0]!.suppress_when_silent).toBe(false);
  expect(items[0]!.chat_mode).toBe("shared");
});

test("routine update: defined fields overwrite, undefined leaves untouched", () => {
  const r = createRoutine(
    { name: "N", prompt: "p", schedule: "0 9 * * *" },
    "r",
    NOW,
  );
  const renamed = applyRoutineUpdate(
    r,
    { name: "M" },
    "2026-06-12T13:00:00.000Z",
  );
  expect(renamed.name).toBe("M");
  expect(renamed.prompt).toBe("p"); // untouched
  expect(renamed.updated_at).toBe("2026-06-12T13:00:00.000Z");
  expect(applyRoutineUpdate(r, { name: undefined }, NOW).name).toBe("N"); // undefined leaves it
});

test("routine update ignores a stray legacy timezone key (HOU-470)", () => {
  // The per-routine override was removed (one account-wide zone). A client still
  // sending it must not get it written back onto the routine.
  const r = createRoutine(
    { name: "N", prompt: "p", schedule: "0 9 * * *" },
    "r",
    NOW,
  );
  const next = applyRoutineUpdate(
    r,
    { timezone: "America/Bogota" } as unknown as RoutineUpdate,
    NOW,
  );
  expect("timezone" in next).toBe(false);
});

test("a stray on-disk per-routine timezone is dropped on read and not re-saved (HOU-470)", async () => {
  const store = memStore();
  // A routine written by an older build still carries a `timezone` key. The
  // reader must drop it (no migration) and never write it back out — the
  // idempotent cleanup that mirrors the Rust engine's serde drop.
  await store.writeText(
    docKey(ROOT, "routines"),
    JSON.stringify([
      {
        id: "legacy-tz",
        name: "Old",
        description: "",
        prompt: "p",
        schedule: "0 9 * * *",
        enabled: true,
        suppress_when_silent: true,
        chat_mode: "shared",
        timezone: "America/Bogota",
        integrations: [],
        created_at: "2026-05-01T00:00:00.000Z",
        updated_at: "2026-05-01T00:00:00.000Z",
      },
    ]),
  );
  const { items } = await loadRoutines(store, ROOT);
  expect(items).toHaveLength(1);
  expect(items[0]!.id).toBe("legacy-tz");
  expect("timezone" in items[0]!).toBe(false);

  await saveRoutines(store, ROOT, items);
  expect(store.dump().get(docKey(ROOT, "routines"))!).not.toContain("timezone");
});

test("routine provider/model/effort: pinned on create, cleared by null, left by undefined", () => {
  const pinned = createRoutine(
    {
      name: "Nightly",
      prompt: "p",
      schedule: "0 2 * * *",
      provider: "anthropic",
      model: "claude-opus-4-8",
      effort: "high",
    },
    "r",
    NOW,
  );
  expect(pinned.provider).toBe("anthropic");
  expect(pinned.model).toBe("claude-opus-4-8");
  expect(pinned.effort).toBe("high");

  // A picked model/effort updates the pin; another field's update leaves them.
  const repinned = applyRoutineUpdate(
    pinned,
    { model: "gpt-5.5", effort: "xhigh" },
    NOW,
  );
  expect(repinned.model).toBe("gpt-5.5");
  expect(repinned.effort).toBe("xhigh");
  expect(repinned.provider).toBe("anthropic");

  // Explicit null clears back to inherit; undefined leaves unchanged.
  const cleared = applyRoutineUpdate(
    pinned,
    { provider: null, model: null, effort: null },
    NOW,
  );
  expect(cleared.provider).toBeNull();
  expect(cleared.model).toBeNull();
  expect(cleared.effort).toBeNull();
  const untouched = applyRoutineUpdate(pinned, { name: "Renamed" }, NOW);
  expect(untouched.model).toBe("claude-opus-4-8");
  expect(untouched.effort).toBe("high");
});

test("config: object round-trip; junk reported as empty + diagnostic", async () => {
  const store = memStore();
  await saveConfig(store, ROOT, {
    provider: "anthropic",
    model: "claude-sonnet-4-6",
  });
  expect((await loadConfig(store, ROOT)).config.model).toBe(
    "claude-sonnet-4-6",
  );

  await store.writeText(
    docKey(ROOT, "config"),
    JSON.stringify(["not", "an", "object"]),
  );
  const bad = await loadConfig(store, ROOT);
  expect(bad.config).toEqual({});
  expect(bad.diagnostics).toHaveLength(1);
});

test("missing files load as empty, never throw", async () => {
  const store = memStore();
  expect((await loadActivities(store, ROOT)).items).toEqual([]);
  expect((await loadRoutines(store, ROOT)).items).toEqual([]);
  expect((await loadLearnings(store, ROOT)).items).toEqual([]);
  expect((await loadConfig(store, ROOT)).config).toEqual({});
});

test("seedSchemas writes every family's .schema.json beside its doc", async () => {
  const store = memStore();
  await seedSchemas(store, ROOT);
  const activity = await loadJson<Record<string, unknown>>(
    store,
    schemaKey(ROOT, "activity"),
    {},
  );
  expect(activity.title).toBe("Activity");
  const routines = await loadJson<Record<string, unknown>>(
    store,
    schemaKey(ROOT, "routines"),
    {},
  );
  expect(routines.title).toBe("Routines");
});
