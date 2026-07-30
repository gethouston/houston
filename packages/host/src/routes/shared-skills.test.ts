import type { Server } from "node:http";
import type { Capabilities, HoustonEvent } from "@houston/protocol";
import { afterAll, beforeAll, expect, test } from "vitest";
import { MemoryCredentialStore } from "../credentials/store";
import type { EventHub } from "../events/hub";
import type { TokenVerifier } from "../ports";
import { type ControlPlaneDeps, createControlPlaneServer } from "../server";
import { MemoryWorkspaceStore } from "../store/memory";
import { MemoryVfs } from "../vfs";

const verifier: TokenVerifier = {
  async verify(bearer) {
    return bearer.startsWith("tok:") ? { userId: bearer.slice(4) } : null;
  },
};
const capabilities: Capabilities = {
  profile: "cloud",
  revealInOs: false,
  terminal: false,
  tunnel: false,
  codeExecution: "remote-sandbox",
  providers: [],
  openaiCompatible: false,
  integrations: [],
  sharedSkills: false,
};
const store = new MemoryWorkspaceStore();
const vfs = new MemoryVfs();
const events: HoustonEvent[] = [];
const eventHub: EventHub = {
  emit(_userId, event) {
    events.push(event);
  },
  subscribe() {
    return () => {};
  },
};
const deps: ControlPlaneDeps = {
  verifier,
  store,
  credentials: new MemoryCredentialStore(),
  vault: { sandboxToken: () => "x", validateSandboxToken: () => null },
  channels: {},
  vfs,
  events: eventHub,
  capabilities,
};

let server: Server;
let base = "";
let workspaceId = "";
let agentId = "";
const auth = (who: string) => ({
  Authorization: `Bearer tok:${who}`,
  "Content-Type": "application/json",
});

beforeAll(async () => {
  const workspace = await store.getOrCreatePersonalWorkspace("alice");
  workspaceId = workspace.id;
  agentId = (await store.createAgent({ workspaceId, name: "Writer" })).id;
  server = createControlPlaneServer(deps);
  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve()),
  );
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  base = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test("workspace owner can create and list a shared skill", async () => {
  const created = await fetch(
    `${base}/v1/workspaces/${workspaceId}/shared-skills`,
    {
      method: "POST",
      headers: auth("alice"),
      body: JSON.stringify({
        name: "Brand Voice",
        description: "Write with the company voice",
        content: "## Procedure\nFollow the guide.",
      }),
    },
  );
  expect(created.status).toBe(201);
  expect((await created.json()) as object).toMatchObject({
    name: "brand-voice",
    description: "Write with the company voice",
  });

  const listed = await fetch(
    `${base}/v1/workspaces/${workspaceId}/shared-skills`,
    { headers: auth("alice") },
  );
  expect(listed.status).toBe(200);
  expect((await listed.json()) as object).toMatchObject({
    items: [{ name: "brand-voice" }],
    diagnostics: [],
  });
  expect(events).toContainEqual({
    type: "SharedSkillsChanged",
    workspaceId,
  });
});

test("shared skill detail supports conflict, full-content save, delete, and 404", async () => {
  const duplicate = await fetch(
    `${base}/v1/workspaces/${workspaceId}/shared-skills`,
    {
      method: "POST",
      headers: auth("alice"),
      body: JSON.stringify({
        name: "Brand Voice",
        description: "duplicate",
        content: "duplicate",
      }),
    },
  );
  expect(duplicate.status).toBe(409);

  const savedContent =
    "---\nname: brand-voice\ndescription: Updated\nversion: 2\n---\n\nNew body.\n";
  const saved = await fetch(
    `${base}/v1/workspaces/${workspaceId}/shared-skills/brand-voice`,
    {
      method: "PUT",
      headers: auth("alice"),
      body: JSON.stringify({ content: savedContent }),
    },
  );
  expect(saved.status).toBe(200);

  const detail = await fetch(
    `${base}/v1/workspaces/${workspaceId}/shared-skills/brand-voice`,
    { headers: auth("alice") },
  );
  expect(detail.status).toBe(200);
  expect((await detail.json()) as object).toMatchObject({
    name: "brand-voice",
    version: 2,
    content: savedContent,
  });

  const deleted = await fetch(
    `${base}/v1/workspaces/${workspaceId}/shared-skills/brand-voice`,
    { method: "DELETE", headers: auth("alice") },
  );
  expect(deleted.status).toBe(200);
  expect(
    (
      await fetch(
        `${base}/v1/workspaces/${workspaceId}/shared-skills/brand-voice`,
        { headers: auth("alice") },
      )
    ).status,
  ).toBe(404);
});

test("shared skill routes enforce workspace ownership and missing workspaces", async () => {
  expect(
    (
      await fetch(`${base}/v1/workspaces/missing/shared-skills`, {
        headers: auth("alice"),
      })
    ).status,
  ).toBe(404);
  expect(
    (
      await fetch(`${base}/v1/workspaces/${workspaceId}/shared-skills`, {
        headers: auth("bob"),
      })
    ).status,
  ).toBe(403);
});

test("skills manifest GET/PUT round-trips normalized enablement and emits SkillsChanged", async () => {
  const empty = await fetch(`${base}/agents/${agentId}/skills-manifest`, {
    headers: auth("alice"),
  });
  expect(empty.status).toBe(200);
  expect(await empty.json()).toEqual({ version: 1, enabled: [] });

  const put = await fetch(`${base}/agents/${agentId}/skills-manifest`, {
    method: "PUT",
    headers: auth("alice"),
    body: JSON.stringify({
      version: 99,
      enabled: ["research", "brand-voice", "research", 42],
    }),
  });
  expect(put.status).toBe(200);
  expect(await put.json()).toEqual({
    version: 1,
    enabled: ["brand-voice", "research"],
  });

  const read = await fetch(`${base}/agents/${agentId}/skills-manifest`, {
    headers: auth("alice"),
  });
  expect(await read.json()).toEqual({
    version: 1,
    enabled: ["brand-voice", "research"],
  });
  expect(events).toContainEqual({
    type: "SkillsChanged",
    agentPath: agentId,
  });
});
