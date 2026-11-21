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
  sharedSkills: true,
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

let cloud: Server;
let local: Server;
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
  const createdAgent = await fetch(`${cloudBase}/agents`, {
    method: "POST",
    headers: auth(),
    body: JSON.stringify({ name: "Watcher" }),
  });
  const watcherId = ((await createdAgent.json()) as { id: string }).id;

  const empty = await fetch(`${localBase}/agents/${watcherId}/trigger-status`, {
    headers: auth(),
  });
  expect(empty.status).toBe(200);
  expect((await empty.json()).items).toEqual([]);

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

  const wh = await fetch(`${cloudBase}/agents/${hookedId}/routines`, {
    method: "POST",
    headers: auth(),
    body: JSON.stringify({ name: "On webhook", prompt: "p", trigger: WEBHOOK }),
  });
  const whId = ((await wh.json()) as { id: string }).id;

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
