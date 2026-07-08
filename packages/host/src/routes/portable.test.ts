import type { Server } from "node:http";
import { loadRoutines, unpackAgent } from "@houston/domain";
import type { Capabilities, Routine } from "@houston/protocol";
import { afterAll, beforeAll, expect, test } from "vitest";
import { ProxyChannel } from "../channel/proxy";
import { MemoryCredentialStore } from "../credentials/store";
import { CloudPaths } from "../paths";
import type { RuntimeEndpoint, RuntimeLauncher, TokenVerifier } from "../ports";
import { workspaceRoot } from "../routes/agent-data";
import { type ControlPlaneDeps, createControlPlaneServer } from "../server";
import { MemoryWorkspaceStore } from "../store/memory";
import { MemoryVfs } from "../vfs";

/**
 * The `.houstonagent` share flow end to end through the host: export an agent's
 * selected content → preview the archive → install it as a brand-new agent with
 * that content written in. This is the format that lets an agent move between a
 * desktop and the cloud unchanged.
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

let server: Server;
let base = "";
let agentId = "";
const auth = (who: string) => ({
  Authorization: `Bearer tok:${who}`,
  "Content-Type": "application/json",
});

beforeAll(async () => {
  server = createControlPlaneServer(deps);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;

  // Seed an agent with a CLAUDE.md, a skill, and a routine.
  agentId = (
    (await (
      await fetch(`${base}/agents`, {
        method: "POST",
        headers: auth("alice"),
        body: JSON.stringify({ name: "Sales" }),
      })
    ).json()) as { id: string }
  ).id;
  const ws = await store.getOrCreatePersonalWorkspace("alice");
  const agent = (await store.listAgents(ws.id))[0];
  if (!agent) throw new Error("Expected alice's agent to exist after creation");
  const root = workspaceRoot(ws, agent);
  await vfs.writeText(`${root}/CLAUDE.md`, "# Role\nYou are the sales agent.");
  await fetch(`${base}/agents/${agentId}/skills`, {
    method: "POST",
    headers: auth("alice"),
    body: JSON.stringify({
      name: "Research",
      description: "Deep dive",
      content: "## Procedure\nx",
    }),
  });
  await fetch(`${base}/agents/${agentId}/routines`, {
    method: "POST",
    headers: auth("alice"),
    body: JSON.stringify({
      name: "Daily",
      prompt: "check",
      schedule: "0 9 * * *",
    }),
  });
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

test("export → preview → install round-trips the agent's content into a new agent", async () => {
  // Find the routine id to select it.
  const ws = await store.getOrCreatePersonalWorkspace("alice");
  const agent = (await store.listAgents(ws.id)).find((a) => a.id === agentId);
  if (!agent)
    throw new Error(`Expected to find alice's agent with id ${agentId}`);
  const { items: routines } = await loadRoutines(
    vfs,
    new CloudPaths().agentRoot(ws, agent),
  );
  const routine = routines[0];
  if (!routine) throw new Error("Expected at least one routine to exist");
  const routineId = routine.id;

  // Export.
  const exp = await fetch(`${base}/agents/${agentId}/portable/export`, {
    method: "POST",
    headers: auth("alice"),
    body: JSON.stringify({
      includeClaudeMd: true,
      skillSlugs: ["research"],
      routineIds: [routineId],
      learningIds: [],
    }),
  });
  expect(exp.status).toBe(200);
  expect(exp.headers.get("content-type")).toBe("application/zip");
  const archive = Buffer.from(await exp.arrayBuffer());
  expect(archive.length).toBeGreaterThan(0);

  // Preview.
  const prev = await fetch(`${base}/v1/portable/preview`, {
    method: "POST",
    headers: {
      Authorization: "Bearer tok:bob",
      "Content-Type": "application/octet-stream",
    },
    body: archive,
  });
  expect(prev.status).toBe(200);
  const preview = (await prev.json()) as {
    manifest: { agentName: string };
    inventory: { hasClaudeMd: boolean; skills: unknown[]; routines: unknown[] };
  };
  expect(preview.manifest.agentName).toBe("Sales");
  expect(preview.inventory.hasClaudeMd).toBe(true);
  expect(preview.inventory.skills).toHaveLength(1);
  expect(preview.inventory.routines).toHaveLength(1);

  // Install for a DIFFERENT user — a fresh agent with the content.
  const inst = await fetch(`${base}/v1/portable/install`, {
    method: "POST",
    headers: auth("bob"),
    body: JSON.stringify({
      agentName: "SalesCopy",
      archive: archive.toString("base64"),
    }),
  });
  expect(inst.status).toBe(201);
  const installed = (await inst.json()) as {
    agent: { id: string };
    installed: { skills: unknown[] };
  };
  expect(installed.installed.skills).toHaveLength(1);

  // The new agent really has the skill + routine on disk.
  const bobWs = await store.getOrCreatePersonalWorkspace("bob");
  const bobAgent = (await store.listAgents(bobWs.id)).find(
    (a) => a.name === "SalesCopy",
  );
  if (!bobAgent)
    throw new Error("Expected bob's SalesCopy agent to exist after install");
  const bobRoot = new CloudPaths().agentRoot(bobWs, bobAgent);
  expect(await vfs.readText(`${bobRoot}/CLAUDE.md`)).toContain("sales agent");
  expect(
    await vfs.readText(`${bobRoot}/.agents/skills/research/SKILL.md`),
  ).toContain("## Procedure");
  expect(
    (await loadRoutines(vfs, bobRoot)).items.map((r: Routine) => r.name),
  ).toEqual(["Daily"]);
});

test("preview of junk bytes is a clean 400, not a crash", async () => {
  const r = await fetch(`${base}/v1/portable/preview`, {
    method: "POST",
    headers: {
      Authorization: "Bearer tok:alice",
      "Content-Type": "application/octet-stream",
    },
    body: Buffer.from([1, 2, 3, 4]),
  });
  expect(r.status).toBe(400);
  expect(((await r.json()) as { error: string }).error).toContain(
    "not a valid",
  );
});

test("portable routes still require auth", async () => {
  expect(
    (await fetch(`${base}/v1/portable/preview`, { method: "POST", body: "x" }))
      .status,
  ).toBe(401);
});

test("agent-side portable preview lists the exportable content", async () => {
  const r = await fetch(`${base}/agents/${agentId}/portable/preview`, {
    headers: auth("alice"),
  });
  expect(r.status).toBe(200);
  const preview = (await r.json()) as {
    claudeMd: { byteCount: number; excerpt: string } | null;
    skills: { slug: string; description: string }[];
    routines: { id: string; name: string; promptExcerpt: string }[];
    learnings: unknown[];
  };
  expect(preview.claudeMd?.excerpt).toContain("sales agent");
  expect(preview.claudeMd?.byteCount).toBeGreaterThan(0);
  expect(preview.skills).toEqual([
    expect.objectContaining({ slug: "research", description: "Deep dive" }),
  ]);
  expect(preview.routines).toEqual([
    expect.objectContaining({ name: "Daily", promptExcerpt: "check" }),
  ]);
  expect(preview.learnings).toEqual([]);
});

test("install honors an explicit selection (unticked parts stay out)", async () => {
  const exp = await fetch(`${base}/agents/${agentId}/portable/export`, {
    method: "POST",
    headers: auth("alice"),
    body: JSON.stringify({
      includeClaudeMd: true,
      skillSlugs: ["research"],
      routineIds: [],
      learningIds: [],
    }),
  });
  const archive = Buffer.from(await exp.arrayBuffer());

  const inst = await fetch(`${base}/v1/portable/install`, {
    method: "POST",
    headers: auth("carol"),
    body: JSON.stringify({
      agentName: "Trimmed",
      archive: archive.toString("base64"),
      selection: {
        includeClaudeMd: false,
        skillSlugs: [],
        routineIds: [],
        learningIds: [],
      },
    }),
  });
  expect(inst.status).toBe(201);
  const installed = (await inst.json()) as {
    installed: { hasClaudeMd: boolean; skills: unknown[] };
  };
  expect(installed.installed.hasClaudeMd).toBe(false);
  expect(installed.installed.skills).toEqual([]);

  const carolWs = await store.getOrCreatePersonalWorkspace("carol");
  const carolAgent = (await store.listAgents(carolWs.id)).find(
    (a) => a.name === "Trimmed",
  );
  if (!carolAgent) throw new Error("Expected carol's Trimmed agent to exist");
  const carolRoot = new CloudPaths().agentRoot(carolWs, carolAgent);
  expect(await vfs.readText(`${carolRoot}/CLAUDE.md`)).toBeNull();
  expect(
    await vfs.readText(`${carolRoot}/.agents/skills/research/SKILL.md`),
  ).toBeNull();
});

test("anonymize returns redaction diffs for the selected content", async () => {
  const privId = (
    (await (
      await fetch(`${base}/agents`, {
        method: "POST",
        headers: auth("alice"),
        body: JSON.stringify({ name: "Priv" }),
      })
    ).json()) as { id: string }
  ).id;
  const ws = await store.getOrCreatePersonalWorkspace("alice");
  const priv = (await store.listAgents(ws.id)).find((a) => a.id === privId);
  if (!priv) throw new Error("Expected the Priv agent to exist");
  await vfs.writeText(
    `${workspaceRoot(ws, priv)}/CLAUDE.md`,
    "Contact dan@example.com for escalations.",
  );

  const r = await fetch(`${base}/agents/${privId}/portable/anonymize`, {
    method: "POST",
    headers: auth("alice"),
    body: JSON.stringify({
      claudeMd: true,
      skillSlugs: [],
      routineIds: [],
      learningIds: [],
    }),
  });
  expect(r.status).toBe(200);
  const out = (await r.json()) as {
    claudeMd: {
      before: string;
      after: string;
      summary: string;
      becameEmpty: boolean;
    } | null;
    skills: unknown[];
    mode: string;
    aiError?: string;
  };
  expect(out.claudeMd?.after).toBe("Contact <email> for escalations.");
  expect(out.claudeMd?.summary).toContain("1 email");
  expect(out.claudeMd?.becameEmpty).toBe(false);
  expect(out.skills).toEqual([]);
  // This harness's runtime endpoint is unreachable — the AI pass fails and
  // the regex fallback ships WITH the reason.
  expect(out.mode).toBe("patterns");
  expect(out.aiError).toBeTruthy();
});

test("export applies accepted overrides and stamps the manifest anonymized", async () => {
  const exp = await fetch(`${base}/agents/${agentId}/portable/export`, {
    method: "POST",
    headers: auth("alice"),
    body: JSON.stringify({
      selection: {
        includeClaudeMd: true,
        skillSlugs: ["research"],
        routineIds: [],
        learningIds: [],
      },
      overrides: {
        claudeMd: "# Role\nYou are the <redacted> agent.",
        skillBodies: { research: "## Procedure\nredacted" },
      },
      meta: { anonymized: true },
    }),
  });
  expect(exp.status).toBe(200);
  const pkg = unpackAgent(new Uint8Array(await exp.arrayBuffer()));
  expect(pkg.manifest.anonymized).toBe(true);
  expect(pkg.claudeMd).toBe("# Role\nYou are the <redacted> agent.");
  expect(pkg.skills).toEqual([
    { slug: "research", body: "## Procedure\nredacted" },
  ]);
});
