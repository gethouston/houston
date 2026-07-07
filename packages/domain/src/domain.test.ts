import type { RoutineUpdate } from "@houston/protocol";
import { expect, test } from "vitest";
import {
  applyActivityUpdate,
  createActivity,
  loadActivities,
  normalizeActivities,
  removeById,
  saveActivities,
  upsertById,
} from "./activities";
import { loadConfig, loadLearnings, saveConfig } from "./config";
import { docKey, schemaKey, seedSchemas } from "./layout";
import {
  applyRoutineUpdate,
  createRoutine,
  loadRoutines,
  saveRoutines,
} from "./routines";
import type { TextStore } from "./store";
import { loadJson } from "./store";

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
  expect(items[0]?.status).toBe("running");

  // files-first: the on-disk doc is human/agent-readable (pretty, trailing newline)
  const raw = store.dump().get(docKey(ROOT, "activity"));
  if (raw == null) throw new Error("expected activity doc in store");
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
  expect(items[1]?.status).toBe("future_status"); // unknown status preserved, not dropped
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

test("normalize: a valid pending_interaction survives, an invalid one is stripped with a diagnostic", () => {
  const { items, diagnostics } = normalizeActivities(
    [
      {
        id: "q",
        title: "Ask",
        status: "needs_you",
        description: "",
        pending_interaction: {
          kind: "question",
          question: "Which deck?",
          options: [{ id: "q2", label: "Q2" }],
        },
      },
      {
        id: "c",
        title: "Connect",
        status: "needs_you",
        description: "",
        pending_interaction: { kind: "connect", toolkit: "gmail" },
      },
      {
        id: "ci",
        title: "Custom",
        status: "needs_you",
        description: "",
        pending_interaction: {
          kind: "custom_integration",
          proposal: {
            name: "Acme CRM",
            baseUrl: "https://api.acme.example",
            auth: {
              type: "header",
              header: "Authorization",
              prefix: "Bearer ",
            },
            description: "Acme CRM records",
          },
          reason: "to read your CRM contacts",
        },
      },
      {
        id: "mcp",
        title: "MCP",
        status: "needs_you",
        description: "",
        pending_interaction: {
          kind: "mcp_server",
          proposal: {
            name: "Acme Tracker",
            url: "https://mcp.acme.example",
            auth: { type: "bearer" },
            description: "Acme issue tracker",
          },
          reason: "to read your open issues",
        },
      },
      {
        id: "bad",
        title: "Broken",
        status: "needs_you",
        description: "",
        // missing the required `question` for kind=question
        pending_interaction: { kind: "question" },
      },
    ],
    "k",
  );

  expect(items.map((a) => a.id)).toEqual(["q", "c", "ci", "mcp", "bad"]); // activity kept, only the field dropped
  expect(items[0]?.pending_interaction).toEqual({
    kind: "question",
    question: "Which deck?",
    options: [{ id: "q2", label: "Q2" }],
  });
  expect(items[1]?.pending_interaction).toEqual({
    kind: "connect",
    toolkit: "gmail",
  });
  expect(items[2]?.pending_interaction).toEqual({
    kind: "custom_integration",
    proposal: {
      name: "Acme CRM",
      baseUrl: "https://api.acme.example",
      auth: { type: "header", header: "Authorization", prefix: "Bearer " },
      description: "Acme CRM records",
    },
    reason: "to read your CRM contacts",
  });
  expect(items[3]?.pending_interaction).toEqual({
    kind: "mcp_server",
    proposal: {
      name: "Acme Tracker",
      url: "https://mcp.acme.example",
      auth: { type: "bearer" },
      description: "Acme issue tracker",
    },
    reason: "to read your open issues",
  });
  expect(items[4]?.pending_interaction).toBeUndefined();
  expect(diagnostics).toHaveLength(1);
  expect(diagnostics[0]?.message).toContain("pending_interaction");
});

test("activity update: pending_interaction set / clear / untouched", () => {
  const withInteraction = applyActivityUpdate(
    createActivity({ title: "T" }, "a1", NOW),
    { pending_interaction: { kind: "connect", toolkit: "slack" } },
    NOW,
  );
  expect(withInteraction.pending_interaction).toEqual({
    kind: "connect",
    toolkit: "slack",
  });

  // undefined leaves the current interaction alone
  const untouched = applyActivityUpdate(
    withInteraction,
    { status: "running" },
    NOW,
  );
  expect(untouched.pending_interaction).toEqual({
    kind: "connect",
    toolkit: "slack",
  });

  // explicit null clears the field entirely (not stored as null)
  const cleared = applyActivityUpdate(
    withInteraction,
    { pending_interaction: null },
    NOW,
  );
  expect("pending_interaction" in cleared).toBe(false);
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
  expect(items[0]?.enabled).toBe(true);
  expect(items[0]?.suppress_when_silent).toBe(false);
  expect(items[0]?.chat_mode).toBe("shared");
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
  expect(items[0]?.id).toBe("legacy-tz");
  const item0 = items[0];
  if (item0 == null) throw new Error("expected items[0] to exist");
  expect("timezone" in item0).toBe(false);

  await saveRoutines(store, ROOT, items);
  const routinesRaw = store.dump().get(docKey(ROOT, "routines"));
  if (routinesRaw == null) throw new Error("expected routines doc in store");
  expect(routinesRaw).not.toContain("timezone");
});

test("routine created_by: set on create, preserved on update, round-trips; legacy absent (C2)", async () => {
  const store = memStore();
  // Set from the authenticated creator on create.
  const r = createRoutine(
    { name: "Report", prompt: "p", schedule: "0 9 * * *" },
    "r1",
    NOW,
    "sub-alice",
  );
  expect(r.created_by).toBe("sub-alice");

  // An update (even one changing other fields) preserves the creator — a client
  // cannot reassign it (RoutineUpdate has no created_by).
  const renamed = applyRoutineUpdate(
    r,
    { name: "Daily report", created_by: "sub-mallory" } as RoutineUpdate & {
      created_by: string;
    },
    NOW,
  );
  expect(renamed.created_by).toBe("sub-alice");

  // It survives a save → load round-trip (the tolerant reader spreads it back).
  await saveRoutines(store, ROOT, [r]);
  const { items } = await loadRoutines(store, ROOT);
  expect((items[0] as { created_by?: string }).created_by).toBe("sub-alice");

  // Omitting the creator (legacy / single-user) leaves the key ABSENT, not "".
  const legacy = createRoutine(
    { name: "Old", prompt: "p", schedule: "0 9 * * *" },
    "r2",
    NOW,
  );
  expect("created_by" in legacy).toBe(false);
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
