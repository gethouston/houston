import type { Server } from "node:http";
import { storePublicationKey } from "@houston/domain";
import type { Capabilities } from "@houston/protocol";
import { afterAll, beforeAll, expect, test } from "vitest";
import { ProxyChannel } from "../channel/proxy";
import { MemoryCredentialStore } from "../credentials/store";
import { CloudPaths } from "../paths";
import type { RuntimeEndpoint, RuntimeLauncher, TokenVerifier } from "../ports";
import { type ControlPlaneDeps, createControlPlaneServer } from "../server";
import { MemoryWorkspaceStore } from "../store/memory";
import { MemoryVfs } from "../vfs";

/**
 * The account-based Agent Store host routes end to end through the host. The
 * host does NO store network I/O and holds NO store credentials: it gathers the
 * IR and records a token-free pointer. Covers: store-ir maps the selection to an
 * AgentIR (integrations = skill frontmatter), store-ir validates its
 * input, and the pointer round-trips through POST/GET/DELETE and NEVER carries a
 * token.
 */

const verifier: TokenVerifier = {
  async verify(b) {
    return b.startsWith("tok:") ? { userId: b.slice(4) } : null;
  },
};
const launcher: RuntimeLauncher = {
  async ensureAwake(): Promise<RuntimeEndpoint> {
    return { baseUrl: "http://unused", token: "t" };
  },
  async sleep() {},
  async destroy() {},
  async status() {
    return "running";
  },
};
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

const store = new MemoryWorkspaceStore();
const credentials = new MemoryCredentialStore();
const vfs = new MemoryVfs();

let server: Server;
let base = "";
const auth = (who: string) => ({
  Authorization: `Bearer tok:${who}`,
  "Content-Type": "application/json",
});

beforeAll(async () => {
  const deps: ControlPlaneDeps = {
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
  };
  server = createControlPlaneServer(deps);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

/** Create an agent for `who`, seed a CLAUDE.md + a skill with a Gmail integration. */
async function seedAgent(who: string, name: string): Promise<string> {
  const agentId = (
    (await (
      await fetch(`${base}/agents`, {
        method: "POST",
        headers: auth(who),
        body: JSON.stringify({ name }),
      })
    ).json()) as { id: string }
  ).id;
  const ws = await store.getOrCreatePersonalWorkspace(who);
  const agent = (await store.listAgents(ws.id)).find((a) => a.id === agentId);
  if (!agent) throw new Error(`agent ${name} not found after create`);
  const root = new CloudPaths().agentRoot(ws, agent);
  await vfs.writeText(`${root}/CLAUDE.md`, "# Role\nYou send email.");
  await vfs.writeText(
    `${root}/.agents/skills/mailer/SKILL.md`,
    "---\ntitle: Mailer\ndescription: Sends mail\nintegrations:\n  - gmail\n---\n## Procedure\nSend it.",
  );
  return agentId;
}

const irBody = {
  selection: {
    includeClaudeMd: true,
    skillSlugs: ["mailer"],
    routineIds: [],
    learningIds: [],
  },
  identity: {
    name: "Mailer",
    description: "Sends mail on your behalf.",
    category: "productivity",
    tags: [],
  },
  creator: { displayName: "Dana" },
};

async function rootFor(who: string, agentId: string): Promise<string> {
  const ws = await store.getOrCreatePersonalWorkspace(who);
  const agent = (await store.listAgents(ws.id)).find((a) => a.id === agentId);
  if (!agent) throw new Error("agent not found");
  return new CloudPaths().agentRoot(ws, agent);
}

test("store-ir gathers content into an AgentIR and declares integrations", async () => {
  const agentId = await seedAgent("alice", "Mailer");
  const r = await fetch(`${base}/agents/${agentId}/portable/store-ir`, {
    method: "POST",
    headers: auth("alice"),
    body: JSON.stringify(irBody),
  });
  expect(r.status).toBe(200);
  const out = (await r.json()) as {
    ir: {
      irVersion: string;
      instructions: string;
      integrations: string[];
      identity: { name: string; description: string };
      skills: { slug: string }[];
    };
  };
  expect(out.ir.irVersion).toBe("2.0.0");
  expect(out.ir.instructions).toContain("You send email.");
  expect(out.ir.integrations).toEqual(["GMAIL"]);
  expect(out.ir.identity.name).toBe("Mailer");
  expect(out.ir.skills.map((s) => s.slug)).toEqual(["mailer"]);
});

test("store-ir rejects a request missing the identity name", async () => {
  const agentId = await seedAgent("nora", "Mailer");
  const r = await fetch(`${base}/agents/${agentId}/portable/store-ir`, {
    method: "POST",
    headers: auth("nora"),
    body: JSON.stringify({
      ...irBody,
      identity: { ...irBody.identity, name: "" },
    }),
  });
  expect(r.status).toBe(400);
  expect(((await r.json()) as { error: string }).error).toContain(
    "identity.name",
  );
});

test("the publication pointer round-trips and never carries a token", async () => {
  const agentId = await seedAgent("bob", "Mailer");

  // Never published → the pointer is null.
  const empty = await fetch(
    `${base}/agents/${agentId}/portable/store-publication`,
    { headers: auth("bob") },
  );
  expect(empty.status).toBe(200);
  expect(((await empty.json()) as { pointer: unknown }).pointer).toBeNull();

  // The app records the pointer after a successful gateway publish.
  const pointer = {
    storeAgentId: "11111111-2222-3333-4444-555555555555",
    slug: "mailer",
    shareUrl: "https://agents.gethouston.ai/a/mailer",
    publishedAt: "2026-07-09T00:00:00.000Z",
  };
  const wrote = await fetch(
    `${base}/agents/${agentId}/portable/store-publication`,
    { method: "POST", headers: auth("bob"), body: JSON.stringify(pointer) },
  );
  expect(wrote.status).toBe(200);

  const got = await fetch(
    `${base}/agents/${agentId}/portable/store-publication`,
    { headers: auth("bob") },
  );
  expect(((await got.json()) as { pointer: unknown }).pointer).toEqual(pointer);

  // The on-disk record carries only the pointer fields — no token, ever.
  const raw = await vfs.readText(
    storePublicationKey(await rootFor("bob", agentId)),
  );
  expect(raw).not.toBeNull();
  expect(raw?.toLowerCase()).not.toContain("token");
  expect(raw?.toLowerCase()).not.toContain("secret");
  expect(Object.keys(JSON.parse(raw ?? "{}") as object).sort()).toEqual([
    "publishedAt",
    "shareUrl",
    "slug",
    "storeAgentId",
  ]);

  // DELETE clears it (used after a store-side delete).
  const del = await fetch(
    `${base}/agents/${agentId}/portable/store-publication`,
    { method: "DELETE", headers: auth("bob") },
  );
  expect(del.status).toBe(200);
  const after = await fetch(
    `${base}/agents/${agentId}/portable/store-publication`,
    { headers: auth("bob") },
  );
  expect(((await after.json()) as { pointer: unknown }).pointer).toBeNull();
});

test("a malformed pointer file surfaces instead of silently resetting", async () => {
  const agentId = await seedAgent("mallory", "Mailer");
  await vfs.writeText(
    storePublicationKey(await rootFor("mallory", agentId)),
    "{ not json",
  );
  const r = await fetch(
    `${base}/agents/${agentId}/portable/store-publication`,
    { headers: auth("mallory") },
  );
  expect(r.status).toBe(500);
});
