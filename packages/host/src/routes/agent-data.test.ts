import type { Server } from "node:http";
import { docKey } from "@houston/domain";
import type { Activity, Capabilities, Routine } from "@houston/protocol";
import { afterAll, beforeAll, expect, test } from "vitest";
import { ProxyChannel } from "../channel/proxy";
import { MemoryCredentialStore } from "../credentials/store";
import type { RuntimeEndpoint, RuntimeLauncher, TokenVerifier } from "../ports";
import { type ControlPlaneDeps, createControlPlaneServer } from "../server";
import { MemoryWorkspaceStore } from "../store/memory";
import { MemoryVfs } from "../vfs";
import { workspaceRoot } from "./agent-data";

/**
 * The typed .houston families served by the HOST off the workspace vfs — the
 * P3 slice that un-fakes the web adapter's localStorage stubs. Covers: CRUD
 * lifecycles, schema seeding on agent create, ownership wall, agent-written
 * junk surfacing as diagnostics, and 503 when no vfs is wired.
 */

const verifier: TokenVerifier = {
  async verify(bearer) {
    return bearer.startsWith("tok:") ? { userId: bearer.slice(4) } : null;
  },
};
const launcher: RuntimeLauncher = {
  async ensureAwake(): Promise<RuntimeEndpoint> {
    return { baseUrl: "http://unused.local", token: "t" };
  },
  async sleep() {},
  async destroy() {},
  async status() {
    return "running";
  },
};
const store = new MemoryWorkspaceStore();
const credentials = new MemoryCredentialStore();
const vfs = new MemoryVfs();
const CAPS: Capabilities = {
  profile: "cloud",
  revealInOs: false,
  terminal: false,
  tunnel: false,
  codeExecution: "remote-sandbox",
  providers: ["openai-codex"],
  openaiCompatible: false,
  integrations: [],
};

const deps = (): ControlPlaneDeps => ({
  verifier,
  store,
  credentials,
  vault: { sandboxToken: () => "x", validateSandboxToken: () => null },
  channels: {
    gke: new ProxyChannel({
      launcher,
      proxy: { async forward() {} },
      credentials,
      forwardActingHeader: false,
    }),
  },
  vfs,
  capabilities: CAPS,
});

let server: Server;
let base = "";
let agentId = "";
const auth = (who: string) => ({
  Authorization: `Bearer tok:${who}`,
  "Content-Type": "application/json",
});

beforeAll(async () => {
  server = createControlPlaneServer(deps());
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;

  const created = await fetch(`${base}/agents`, {
    method: "POST",
    headers: auth("alice"),
    body: JSON.stringify({ name: "Helper" }),
  });
  agentId = ((await created.json()) as { id: string }).id;
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

test("agent creation seeds the .houston schemas into the workspace", async () => {
  const ws = await store.getOrCreatePersonalWorkspace("alice");
  const agent = (await store.listAgents(ws.id))[0];
  if (!agent) throw new Error("Expected at least one agent in workspace");
  const root = workspaceRoot(ws, agent);
  const keys = await vfs.list(root);
  expect(keys).toContain(`${root}/.houston/activity/activity.schema.json`);
  expect(keys).toContain(`${root}/.houston/routines/routines.schema.json`);
});

test("activities: full CRUD lifecycle over the host", async () => {
  const created = await fetch(`${base}/agents/${agentId}/activities`, {
    method: "POST",
    headers: auth("alice"),
    body: JSON.stringify({
      title: "Build the Q2 deck",
      description: "10 slides",
    }),
  });
  expect(created.status).toBe(201);
  const activity = (await created.json()) as Activity;
  expect(activity.status).toBe("running");

  const patched = await fetch(
    `${base}/agents/${agentId}/activities/${activity.id}`,
    {
      method: "PATCH",
      headers: auth("alice"),
      body: JSON.stringify({ status: "done" }),
    },
  );
  expect(patched.status).toBe(200);
  expect(((await patched.json()) as Activity).status).toBe("done");

  const list = await fetch(`${base}/agents/${agentId}/activities`, {
    headers: auth("alice"),
  });
  const body = (await list.json()) as {
    items: Activity[];
    diagnostics: unknown[];
  };
  expect(body.items.map((a) => a.title)).toEqual(["Build the Q2 deck"]);

  const deleted = await fetch(
    `${base}/agents/${agentId}/activities/${activity.id}`,
    {
      method: "DELETE",
      headers: auth("alice"),
    },
  );
  expect(deleted.status).toBe(200);
  expect(await deleted.json()).toEqual({ ok: true, deleted: true });

  const deletedAgain = await fetch(
    `${base}/agents/${agentId}/activities/${activity.id}`,
    {
      method: "DELETE",
      headers: auth("alice"),
    },
  );
  expect(deletedAgain.status).toBe(200);
  expect(await deletedAgain.json()).toEqual({ ok: true, deleted: false });
  expect(
    (
      await fetch(`${base}/agents/${agentId}/activities/${activity.id}`, {
        method: "PATCH",
        headers: auth("alice"),
        body: "{}",
      })
    ).status,
  ).toBe(404);
});

test("routines: created with schema defaults; a stray per-routine timezone is ignored (HOU-470)", async () => {
  const created = await fetch(`${base}/agents/${agentId}/routines`, {
    method: "POST",
    headers: auth("alice"),
    // `timezone` is no longer a routine field (one account-wide zone); a client
    // still sending it must be ignored, not written onto the routine.
    body: JSON.stringify({
      name: "Daily report",
      prompt: "Write it",
      schedule: "0 9 * * 1-5",
      timezone: "America/Bogota",
    }),
  });
  expect(created.status).toBe(201);
  const routine = (await created.json()) as Routine;
  expect(routine.enabled).toBe(true);
  expect(routine.chat_mode).toBe("shared");
  expect("timezone" in routine).toBe(false);

  const runs = await fetch(`${base}/agents/${agentId}/routine_runs`, {
    headers: auth("alice"),
  });
  expect(((await runs.json()) as { items: unknown[] }).items).toEqual([]);
});

test("routines: created_by is server-owned and cannot be spoofed", async () => {
  const created = await fetch(`${base}/agents/${agentId}/routines`, {
    method: "POST",
    headers: auth("alice"),
    body: JSON.stringify({
      name: "Daily report",
      prompt: "Write it",
      schedule: "0 9 * * 1-5",
      created_by: "mallory",
    }),
  });
  expect(created.status).toBe(201);
  const routine = (await created.json()) as Routine;
  expect(routine.created_by).toBe("alice");

  const patched = await fetch(
    `${base}/agents/${agentId}/routines/${routine.id}`,
    {
      method: "PATCH",
      headers: auth("alice"),
      body: JSON.stringify({ name: "Renamed", created_by: "mallory" }),
    },
  );
  expect(patched.status).toBe(200);
  const next = (await patched.json()) as Routine;
  expect(next.name).toBe("Renamed");
  expect(next.created_by).toBe("alice");
});

test("routines: an invalid cron is rejected at create (400), never saved to fail silently", async () => {
  const bad = await fetch(`${base}/agents/${agentId}/routines`, {
    method: "POST",
    headers: auth("alice"),
    body: JSON.stringify({
      name: "Broken",
      prompt: "p",
      schedule: "not a cron",
    }),
  });
  expect(bad.status).toBe(400);
  expect(((await bad.json()) as { error: string }).error).toContain(
    "invalid schedule",
  );

  // The schedule is validated against the single account-wide zone (HOU-470),
  // not a per-routine one: an invalid account timezone rejects the create.
  await fetch(`${base}/v1/preferences/timezone`, {
    method: "PUT",
    headers: auth("alice"),
    body: JSON.stringify({ value: "Mars/Phobos" }),
  });
  try {
    const badTz = await fetch(`${base}/agents/${agentId}/routines`, {
      method: "POST",
      headers: auth("alice"),
      body: JSON.stringify({
        name: "BadTz",
        prompt: "p",
        schedule: "0 9 * * *",
      }),
    });
    expect(badTz.status).toBe(400);
  } finally {
    // Restore so later tests see a clean (unset) account zone.
    await fetch(`${base}/v1/preferences/timezone`, {
      method: "PUT",
      headers: auth("alice"),
      body: JSON.stringify({ value: null }),
    });
  }
});

test("routines: an unknown provider pin is rejected (400), a Rust-era alias round-trips", async () => {
  // A typo'd/unknown provider must not save — every fired run would error.
  const bad = await fetch(`${base}/agents/${agentId}/routines`, {
    method: "POST",
    headers: auth("alice"),
    body: JSON.stringify({
      name: "Junk pin",
      prompt: "p",
      schedule: "0 9 * * *",
      provider: "gemini-cli",
    }),
  });
  expect(bad.status).toBe(400);
  expect(((await bad.json()) as { error: string }).error).toContain(
    "unknown provider: gemini-cli",
  );

  // A migrated routines.json can still say "claude" (routinePin maps it at
  // fire time and never rewrites the file) — the editor round-trips that
  // stored value verbatim on ANY save, so validation must accept the alias or
  // a legacy-pinned routine becomes uneditable.
  const created = await fetch(`${base}/agents/${agentId}/routines`, {
    method: "POST",
    headers: auth("alice"),
    body: JSON.stringify({
      name: "Legacy pin",
      prompt: "p",
      schedule: "0 9 * * *",
    }),
  });
  const routine = (await created.json()) as Routine;
  const patched = await fetch(
    `${base}/agents/${agentId}/routines/${routine.id}`,
    {
      method: "PATCH",
      headers: auth("alice"),
      body: JSON.stringify({ name: "Renamed", provider: "claude" }),
    },
  );
  expect(patched.status).toBe(200);
  expect(((await patched.json()) as Routine).name).toBe("Renamed");
});

test("config: PUT replaces, GET reads back", async () => {
  const put = await fetch(`${base}/agents/${agentId}/config`, {
    method: "PUT",
    headers: auth("alice"),
    body: JSON.stringify({ provider: "openai-codex", model: "gpt-5.5" }),
  });
  expect(put.status).toBe(200);
  const got = await fetch(`${base}/agents/${agentId}/config`, {
    headers: auth("alice"),
  });
  expect(
    ((await got.json()) as { config: { model: string } }).config.model,
  ).toBe("gpt-5.5");
});

test("agent-written junk in activity.json drops bad entries AND surfaces diagnostics", async () => {
  const ws = await store.getOrCreatePersonalWorkspace("alice");
  const agent = (await store.listAgents(ws.id))[0];
  if (!agent) throw new Error("Expected at least one agent in workspace");
  await vfs.writeText(
    docKey(workspaceRoot(ws, agent), "activity"),
    JSON.stringify([
      { id: "ok", title: "Good", description: "", status: "done" },
      { broken: true },
    ]),
  );
  const r = await fetch(`${base}/agents/${agentId}/activities`, {
    headers: auth("alice"),
  });
  const body = (await r.json()) as {
    items: Activity[];
    diagnostics: { message: string }[];
  };
  expect(body.items.map((a) => a.id)).toEqual(["ok"]);
  expect(body.diagnostics).toHaveLength(1);
  expect(body.diagnostics[0]?.message).toContain("malformed");
});

test("another user is walled off from the data families (403)", async () => {
  const r = await fetch(`${base}/agents/${agentId}/activities`, {
    headers: auth("bob"),
  });
  expect(r.status).toBe(403);
});

test("raw agentfile read/write — what the desktop board actually uses", async () => {
  // Use learnings (untouched by other tests). Missing → "" (app falls back to []).
  const path = ".houston/learnings/learnings.json";
  const empty = await fetch(`${base}/agents/${agentId}/agentfile/${path}`, {
    headers: auth("alice"),
  });
  expect(empty.status).toBe(200);
  expect(((await empty.json()) as { content: string }).content).toBe("");

  // Write the whole doc, then read it back verbatim.
  const doc = JSON.stringify([
    { id: "l1", text: "remember this", created_at: "2026-06-15T00:00:00.000Z" },
  ]);
  const put = await fetch(`${base}/agents/${agentId}/agentfile/${path}`, {
    method: "PUT",
    headers: auth("alice"),
    body: JSON.stringify({ content: doc }),
  });
  expect(put.status).toBe(200);

  const read = await fetch(`${base}/agents/${agentId}/agentfile/${path}`, {
    headers: auth("alice"),
  });
  expect(((await read.json()) as { content: string }).content).toBe(doc);

  // The typed route sees the SAME file (one store — the raw write and typed read agree).
  const typed = await fetch(`${base}/agents/${agentId}/learnings`, {
    headers: auth("alice"),
  });
  expect(
    ((await typed.json()) as { items: { id: string }[] }).items[0]?.id,
  ).toBe("l1");
});

// (No HTTP traversal test: the URL spec normalizes `..`/`%2e%2e` path segments
// away before the request is sent, so the handler's `..` guard — defense in
// depth — is unreachable over HTTP. Asserting it via fetch would be meaningless.)

test("CORS preflight allows PUT (writeAgentFile/preferences/saveSkill all PUT)", async () => {
  const r = await fetch(
    `${base}/agents/${agentId}/agentfile/.houston/config/config.json`,
    {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:1430",
        "Access-Control-Request-Method": "PUT",
      },
    },
  );
  expect(r.status).toBe(204);
  expect(r.headers.get("access-control-allow-methods")).toContain("PUT");
  await r.text();
});

test("agentfile is walled off across users (403)", async () => {
  const r = await fetch(
    `${base}/agents/${agentId}/agentfile/.houston/config/config.json`,
    { headers: auth("bob") },
  );
  expect(r.status).toBe(403);
});

test("skills: create → list → read → edit → delete, full lifecycle over the host", async () => {
  const created = await fetch(`${base}/agents/${agentId}/skills`, {
    method: "POST",
    headers: auth("alice"),
    body: JSON.stringify({
      name: "Summarize Inbox",
      description: "Summarize unread email",
      content: "## Procedure\nDo the thing.",
    }),
  });
  expect(created.status).toBe(201);
  const detail = (await created.json()) as { name: string; content: string };
  expect(detail.name).toBe("summarize-inbox");
  expect(detail.content).toContain("## Procedure");

  // Duplicate create → 409, never a silent overwrite.
  const dup = await fetch(`${base}/agents/${agentId}/skills`, {
    method: "POST",
    headers: auth("alice"),
    body: JSON.stringify({
      name: "Summarize Inbox",
      description: "d",
      content: "c",
    }),
  });
  expect(dup.status).toBe(409);

  const list = await fetch(`${base}/agents/${agentId}/skills`, {
    headers: auth("alice"),
  });
  const skills = (await list.json()) as {
    items: { name: string; featured: boolean }[];
  };
  expect(skills.items.map((s) => s.name)).toContain("summarize-inbox");

  const put = await fetch(`${base}/agents/${agentId}/skills/summarize-inbox`, {
    method: "PUT",
    headers: auth("alice"),
    body: JSON.stringify({
      content:
        "---\nname: summarize-inbox\ndescription: v2\nversion: 2\n---\n\nNew body.\n",
    }),
  });
  expect(put.status).toBe(200);
  const read = await fetch(`${base}/agents/${agentId}/skills/summarize-inbox`, {
    headers: auth("alice"),
  });
  expect(((await read.json()) as { version: number }).version).toBe(2);

  const del = await fetch(`${base}/agents/${agentId}/skills/summarize-inbox`, {
    method: "DELETE",
    headers: auth("alice"),
  });
  expect(del.status).toBe(200);
  expect(
    (
      await fetch(`${base}/agents/${agentId}/skills/summarize-inbox`, {
        headers: auth("alice"),
      })
    ).status,
  ).toBe(404);
});

test("skills are walled off across users (403) like every agent surface", async () => {
  expect(
    (await fetch(`${base}/agents/${agentId}/skills`, { headers: auth("bob") }))
      .status,
  ).toBe(403);
});

test("no vfs wired → typed data routes answer 503, runtime dispatch unaffected", async () => {
  const noVfs = createControlPlaneServer({ ...deps(), vfs: undefined });
  await new Promise<void>((r) => noVfs.listen(0, "127.0.0.1", () => r()));
  const addr = noVfs.address();
  const b = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  try {
    const r = await fetch(`${b}/agents/${agentId}/activities`, {
      headers: auth("alice"),
    });
    expect(r.status).toBe(503);
  } finally {
    await new Promise<void>((r) => noVfs.close(() => r()));
  }
});
