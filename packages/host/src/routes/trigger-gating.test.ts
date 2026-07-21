import type { Server, ServerResponse } from "node:http";
import type { Capabilities } from "@houston/protocol";
import { afterAll, beforeAll, expect, test } from "vitest";
import { ProxyChannel } from "../channel/proxy";
import { MemoryCredentialStore } from "../credentials/store";
import type { Agent, Workspace } from "../domain/types";
import { CloudPaths } from "../paths";
import type { RuntimeEndpoint, RuntimeLauncher, TokenVerifier } from "../ports";
import { type ControlPlaneDeps, createControlPlaneServer } from "../server";
import { MemoryWorkspaceStore } from "../store/memory";
import { MemoryVfs } from "../vfs";
import { handleTriggerStatus } from "./trigger-status";

/**
 * Honest trigger status + the write gate on a deployment WITHOUT a trigger
 * backend (desktop / self-host, `triggersEnabled: false`): a trigger-bound
 * routine can never wake, so its write is refused and its status is a hard
 * error. Schedule routines are untouched. A shared store/vfs lets a
 * trigger-CAPABLE server seed a legacy trigger routine that the no-backend
 * server must still list (reads are ungated) and report as unable to wake.
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
  profile: "local",
  revealInOs: true,
  terminal: true,
  tunnel: false,
  codeExecution: "local-bash",
  providers: ["openai-codex"],
  openaiCompatible: true,
  integrations: [],
};

const makeDeps = (triggersEnabled: boolean): ControlPlaneDeps => ({
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
  triggersEnabled,
});

const TRIGGER = {
  toolkit: "gmail",
  trigger_slug: "GMAIL_NEW_GMAIL_MESSAGE",
  trigger_config: { labelIds: ["INBOX"] },
};

const WEBHOOK = { kind: "webhook" as const };

const NO_BACKEND_WRITE_ERROR =
  "Event triggers are not available here. Give this automation a schedule instead.";

let cloud: Server; // triggersEnabled: true — seeds trigger routines
let local: Server; // triggersEnabled: false — the deployment under test
let cloudBase = "";
let localBase = "";
let agentId = "";

const auth = () => ({
  Authorization: "Bearer tok:alice",
  "Content-Type": "application/json",
});
const listen = (s: Server) =>
  new Promise<string>((r) =>
    s.listen(0, "127.0.0.1", () => {
      const a = s.address();
      r(`http://127.0.0.1:${typeof a === "object" && a ? a.port : 0}`);
    }),
  );

beforeAll(async () => {
  cloud = createControlPlaneServer(makeDeps(true));
  local = createControlPlaneServer(makeDeps(false));
  cloudBase = await listen(cloud);
  localBase = await listen(local);
  const created = await fetch(`${cloudBase}/agents`, {
    method: "POST",
    headers: auth(),
    body: JSON.stringify({ name: "Helper" }),
  });
  agentId = ((await created.json()) as { id: string }).id;
});

afterAll(async () => {
  await new Promise<void>((r) => cloud.close(() => r()));
  await new Promise<void>((r) => local.close(() => r()));
});

test("write gate: a trigger POST is refused with a relay-ready message; a schedule POST is accepted", async () => {
  const rejected = await fetch(`${localBase}/agents/${agentId}/routines`, {
    method: "POST",
    headers: auth(),
    body: JSON.stringify({
      name: "On email",
      prompt: "do it",
      trigger: TRIGGER,
    }),
  });
  expect(rejected.status).toBe(400);
  expect((await rejected.json()).error).toBe(NO_BACKEND_WRITE_ERROR);

  const accepted = await fetch(`${localBase}/agents/${agentId}/routines`, {
    method: "POST",
    headers: auth(),
    body: JSON.stringify({
      name: "Daily",
      prompt: "do it",
      schedule: "0 9 * * *",
    }),
  });
  expect(accepted.status).toBe(201);
});

test("write gate: a webhook trigger POST is refused off-backend, accepted shape-wise on a trigger-capable host", async () => {
  // Same gate as a Composio trigger: no backend here → the webhook could never
  // wake, so its write is refused with the relay-ready message.
  const rejected = await fetch(`${localBase}/agents/${agentId}/routines`, {
    method: "POST",
    headers: auth(),
    body: JSON.stringify({
      name: "On webhook",
      prompt: "do it",
      trigger: WEBHOOK,
    }),
  });
  expect(rejected.status).toBe(400);
  expect((await rejected.json()).error).toBe(NO_BACKEND_WRITE_ERROR);

  // On a trigger-capable host the webhook binding is accepted shape-wise (no
  // key_prefix yet — minting stamps it later). The binding round-trips intact.
  const accepted = await fetch(`${cloudBase}/agents/${agentId}/routines`, {
    method: "POST",
    headers: auth(),
    body: JSON.stringify({
      name: "On webhook",
      prompt: "do it",
      trigger: WEBHOOK,
    }),
  });
  expect(accepted.status).toBe(201);
  expect((await accepted.json()).trigger).toEqual(WEBHOOK);
});

test("write gate: a PATCH keeping a trigger is refused; converting it to a schedule is accepted", async () => {
  // Seed a legacy trigger routine via the trigger-capable server (same store).
  const seeded = await fetch(`${cloudBase}/agents/${agentId}/routines`, {
    method: "POST",
    headers: auth(),
    body: JSON.stringify({ name: "Legacy", prompt: "p", trigger: TRIGGER }),
  });
  const { id } = (await seeded.json()) as { id: string };

  const kept = await fetch(`${localBase}/agents/${agentId}/routines/${id}`, {
    method: "PATCH",
    headers: auth(),
    body: JSON.stringify({ name: "Legacy renamed" }),
  });
  expect(kept.status).toBe(400);
  expect((await kept.json()).error).toBe(NO_BACKEND_WRITE_ERROR);

  const converted = await fetch(
    `${localBase}/agents/${agentId}/routines/${id}`,
    {
      method: "PATCH",
      headers: auth(),
      body: JSON.stringify({ schedule: "0 8 * * *", trigger: null }),
    },
  );
  expect(converted.status).toBe(200);
  const next = (await converted.json()) as Record<string, unknown>;
  expect(next.schedule).toBe("0 8 * * *");
  expect("trigger" in next).toBe(false);
});

test("trigger-status: each trigger routine reports error with a human detail; a schedule-only agent gets []", async () => {
  // Fresh agent so this test owns its routine set.
  const createdAgent = await fetch(`${cloudBase}/agents`, {
    method: "POST",
    headers: auth(),
    body: JSON.stringify({ name: "Watcher" }),
  });
  const watcherId = ((await createdAgent.json()) as { id: string }).id;

  // Empty (no routines) → [].
  const empty = await fetch(`${localBase}/agents/${watcherId}/trigger-status`, {
    headers: auth(),
  });
  expect(empty.status).toBe(200);
  expect((await empty.json()).items).toEqual([]);

  // Seed one trigger routine + one schedule routine via the capable server.
  const trg = await fetch(`${cloudBase}/agents/${watcherId}/routines`, {
    method: "POST",
    headers: auth(),
    body: JSON.stringify({ name: "On email", prompt: "p", trigger: TRIGGER }),
  });
  const trgId = ((await trg.json()) as { id: string }).id;
  await fetch(`${cloudBase}/agents/${watcherId}/routines`, {
    method: "POST",
    headers: auth(),
    body: JSON.stringify({ name: "Daily", prompt: "p", schedule: "0 9 * * *" }),
  });

  // The no-backend server reports the trigger routine as error, schedule ignored.
  const status = await fetch(
    `${localBase}/agents/${watcherId}/trigger-status`,
    { headers: auth() },
  );
  expect(status.status).toBe(200);
  const { items } = (await status.json()) as {
    items: { routine_id: string; status: string; detail?: string }[];
  };
  expect(items).toHaveLength(1);
  expect(items[0]?.routine_id).toBe(trgId);
  expect(items[0]?.status).toBe("error");
  expect(items[0]?.detail).toContain("cannot wake here");
});

test("trigger-status: a webhook routine reports error with a human detail like any trigger routine", async () => {
  const createdAgent = await fetch(`${cloudBase}/agents`, {
    method: "POST",
    headers: auth(),
    body: JSON.stringify({ name: "Hooked" }),
  });
  const hookedId = ((await createdAgent.json()) as { id: string }).id;

  // Seed a webhook routine via the trigger-capable host.
  const wh = await fetch(`${cloudBase}/agents/${hookedId}/routines`, {
    method: "POST",
    headers: auth(),
    body: JSON.stringify({ name: "On webhook", prompt: "p", trigger: WEBHOOK }),
  });
  const whId = ((await wh.json()) as { id: string }).id;

  // The no-backend host reports it as error, exactly like a Composio trigger.
  const status = await fetch(`${localBase}/agents/${hookedId}/trigger-status`, {
    headers: auth(),
  });
  expect(status.status).toBe(200);
  const { items } = (await status.json()) as {
    items: { routine_id: string; status: string; detail?: string }[];
  };
  expect(items).toHaveLength(1);
  expect(items[0]?.routine_id).toBe(whId);
  expect(items[0]?.status).toBe("error");
  expect(items[0]?.detail).toContain("cannot wake here");
});

test("trigger-status: when triggers CAN fire, the host is not the authority and falls through", async () => {
  const ctx = {
    workspace: {} as Workspace,
    agent: {} as Agent,
  };
  const noRes = {} as ServerResponse;
  // triggersEnabled true → returns false without touching vfs/res.
  expect(
    await handleTriggerStatus(
      undefined,
      new CloudPaths(),
      ctx,
      "GET",
      "trigger-status",
      noRes,
      true,
    ),
  ).toBe(false);
  // A non-matching subpath also falls through.
  expect(
    await handleTriggerStatus(
      undefined,
      new CloudPaths(),
      ctx,
      "GET",
      "activity",
      noRes,
      false,
    ),
  ).toBe(false);
});
