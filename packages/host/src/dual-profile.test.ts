import { mkdtempSync } from "node:fs";
import { createServer as netCreateServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Capabilities, PROTOCOL_VERSION } from "@houston/protocol";
import { expect, test } from "vitest";
import { CLOUD_CAPABILITIES, LOCAL_CAPABILITIES } from "./capabilities";
import { ProxyChannel } from "./channel/proxy";
import { MemoryCredentialStore } from "./credentials/store";
import { BusEventHub } from "./events/hub";
import { FakeLauncher } from "./launcher/fake";
import type { RuntimeSpawner } from "./launcher/process";
import { buildLocalHost, type LocalHost } from "./local/host";
import { CloudPaths } from "./paths";
import type { TokenVerifier } from "./ports";
import { type ControlPlaneDeps, createControlPlaneServer } from "./server";
import { MemoryWorkspaceStore } from "./store/memory";
import { MemoryTurnBus } from "./turn/bus";
import { MemoryVfs } from "./vfs";

const TOKEN = "boot-secret";
const auth = {
  Authorization: `Bearer ${TOKEN}`,
  "Content-Type": "application/json",
};

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = netCreateServer();
    s.listen(0, "127.0.0.1", () => {
      const addr = s.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      s.close(() => resolve(port));
    });
  });
}

const fakeSpawner: RuntimeSpawner = {
  spawn: () => ({ port: 0, kill: () => {} }),
};

async function bootLocal(): Promise<{ host: LocalHost; base: string }> {
  const workspacesRoot = mkdtempSync(join(tmpdir(), "parity-local-"));
  const credentialsPath = join(
    mkdtempSync(join(tmpdir(), "parity-cred-")),
    "credentials.json",
  );
  const port = await freePort();
  const host = buildLocalHost({
    workspacesRoot,
    credentialsPath,
    port,
    token: TOKEN,
    runtimeCommand: ["true"],
    spawner: fakeSpawner,
  });
  await host.start();
  return { host, base: `http://127.0.0.1:${port}` };
}

async function bootCloud(): Promise<{
  server: ReturnType<typeof createControlPlaneServer>;
  base: string;
}> {
  const store = new MemoryWorkspaceStore({ defaultRuntime: "gke" });
  const credentials = new MemoryCredentialStore();
  const bus = new MemoryTurnBus();
  const verifier: TokenVerifier = {
    async verify(bearer) {
      return bearer === TOKEN ? { userId: "cloud-owner" } : null;
    },
  };
  const deps: ControlPlaneDeps = {
    verifier,
    store,
    credentials,
    vault: { sandboxToken: () => "x", validateSandboxToken: () => null },
    vfs: new MemoryVfs(),
    paths: new CloudPaths(),
    events: new BusEventHub(bus),
    channels: {
      gke: new ProxyChannel({
        launcher: new FakeLauncher(),
        proxy: { async forward() {} },
        credentials,
        forwardActingHeader: true,
      }),
    },
    capabilities: CLOUD_CAPABILITIES,
    corsOrigin: "*",
  };
  const server = createControlPlaneServer(deps);
  const port = await freePort();
  await new Promise<void>((r) => server.listen(port, "127.0.0.1", () => r()));
  return { server, base: `http://127.0.0.1:${port}` };
}

const VOLATILE = new Set([
  "id",
  "workspaceId",
  "agentId",
  "agentPath",
  "createdAt",
  "created_at",
  "updatedAt",
  "updated_at",
  "session_key",
  "created",
  "exportedAt",
  "created_by",
]);

function norm(v: unknown, agentId: string): unknown {
  if (typeof v === "string") {
    let s = v;
    if (agentId)
      s = s
        .split(agentId)
        .join("<AGENT>")
        .split(encodeURIComponent(agentId))
        .join("<AGENT>");
    return s.replace(/\d{4}-\d{2}-\d{2}(T[\d:.]+Z)?/g, "<DATE>");
  }
  if (Array.isArray(v)) return v.map((x) => norm(x, agentId));
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) {
      if (ASYMMETRIC.has(k)) continue;
      out[k] = VOLATILE.has(k) ? "<X>" : norm(val, agentId);
    }
    return out;
  }
  return v;
}

const ASYMMETRIC = new Set(["dir"]);

type Step = {
  label: string;
  status?: number;
  contentType?: string;
  body?: unknown;
  value?: unknown;
};

async function battery(base: string): Promise<Step[]> {
  const raw: Step[] = [];

  const created = await fetch(`${base}/agents`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ name: "Helper" }),
  });
  const createdBody = (await created.json()) as { id: string };
  const agentId = createdBody.id;
  const a = encodeURIComponent(agentId);
  raw.push({
    label: "POST /agents",
    status: created.status,
    body: createdBody,
  });

  const hit = async (
    label: string,
    path: string,
    init?: RequestInit & { headers?: Record<string, string> },
  ) => {
    const res = await fetch(`${base}${path}`, {
      ...init,
      headers: { ...auth, ...(init?.headers ?? {}) },
    });
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      raw.push({ label, status: res.status, body: await res.json() });
    } else {
      const buf = new Uint8Array(await res.arrayBuffer());
      raw.push({
        label,
        status: res.status,
        contentType: ct.split(";")[0],
        value: buf.length > 0,
      });
    }
    return res;
  };

  await hit("POST /agents (no name → 400)", "/agents", {
    method: "POST",
    body: JSON.stringify({}),
  });
  await hit("GET /agents (list)", "/agents");

  await hit("GET activities (empty)", `/agents/${a}/activities`);
  const act = (await (
    await fetch(`${base}/agents/${a}/activities`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        title: "Build the Q2 deck",
        description: "10 slides",
      }),
    })
  ).json()) as { id: string; status: string };
  raw.push({ label: "POST activity", body: act });
  await hit(
    "PATCH activity → done",
    `/agents/${a}/activities/${encodeURIComponent(act.id)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ status: "done" }),
    },
  );
  await hit("GET activities (one)", `/agents/${a}/activities`);
  await hit(
    "DELETE activity",
    `/agents/${a}/activities/${encodeURIComponent(act.id)}`,
    { method: "DELETE" },
  );
  await hit(
    "PATCH deleted activity → 404",
    `/agents/${a}/activities/${encodeURIComponent(act.id)}`,
    {
      method: "PATCH",
      body: "{}",
    },
  );

  await hit("POST routine (good cron)", `/agents/${a}/routines`, {
    method: "POST",
    body: JSON.stringify({
      name: "Daily report",
      prompt: "Write it",
      schedule: "0 9 * * 1-5",
    }),
  });
  await hit("POST routine (bad cron → 400)", `/agents/${a}/routines`, {
    method: "POST",
    body: JSON.stringify({
      name: "Broken",
      prompt: "p",
      schedule: "not a cron",
    }),
  });
  await hit("GET routines", `/agents/${a}/routines`);
  await hit("GET routine_runs (empty)", `/agents/${a}/routine_runs`);

  await hit("PUT config", `/agents/${a}/config`, {
    method: "PUT",
    body: JSON.stringify({ provider: "openai-codex", model: "gpt-5.5" }),
  });
  await hit("GET config", `/agents/${a}/config`);

  await hit(
    "POST claude-oauth (malformed → 400)",
    `/agents/${a}/credential/claude-oauth`,
    { method: "POST", body: JSON.stringify({ nope: true }) },
  );

  await hit("PUT agentfile CLAUDE.md", `/agents/${a}/agentfile/CLAUDE.md`, {
    method: "PUT",
    body: JSON.stringify({ content: "# Role\nYou help with planning.\n" }),
  });

  await hit("POST skill", `/agents/${a}/skills`, {
    method: "POST",
    body: JSON.stringify({
      name: "Summarize Inbox",
      description: "Summarize unread email",
      content: "## Procedure\nDo the thing.",
    }),
  });
  await hit("POST skill (dup → 409)", `/agents/${a}/skills`, {
    method: "POST",
    body: JSON.stringify({
      name: "Summarize Inbox",
      description: "d",
      content: "c",
    }),
  });
  await hit("GET skills (list)", `/agents/${a}/skills`);
  await hit("GET skill", `/agents/${a}/skills/summarize-inbox`);

  const learnPath = ".houston/learnings/learnings.json";
  await hit(
    "GET learnings file (empty)",
    `/agents/${a}/agentfile/${learnPath}`,
  );
  await hit("PUT learnings file", `/agents/${a}/agentfile/${learnPath}`, {
    method: "PUT",
    body: JSON.stringify({
      content: JSON.stringify([
        {
          id: "l1",
          text: "remember this",
          created_at: "2026-06-15T00:00:00.000Z",
        },
      ]),
    }),
  });
  await hit("GET learnings (typed)", `/agents/${a}/learnings`);

  const exp = await fetch(`${base}/agents/${a}/portable/export`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      includeClaudeMd: true,
      skillSlugs: ["summarize-inbox"],
      routineIds: [],
      learningIds: [],
    }),
  });
  const zip = new Uint8Array(await exp.arrayBuffer());
  raw.push({
    label: "POST portable/export",
    status: exp.status,
    contentType: (exp.headers.get("content-type") ?? "").split(";")[0],
    value: zip.length > 0,
  });
  const prev = await fetch(`${base}/v1/portable/preview`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/zip",
    },
    body: zip,
  });
  raw.push({
    label: "POST portable/preview",
    status: prev.status,
    body: await prev.json(),
  });

  await hit("DELETE skill", `/agents/${a}/skills/summarize-inbox`, {
    method: "DELETE",
  });
  await hit("GET deleted skill → 404", `/agents/${a}/skills/summarize-inbox`);

  await hit("PATCH /agents (rename)", `/agents/${a}`, {
    method: "PATCH",
    body: JSON.stringify({ name: "Planner" }),
  });

  return raw.map((s) => ({
    ...s,
    ...(s.body !== undefined ? { body: norm(s.body, agentId) } : {}),
  }));
}

test("the v3 wire behavior is byte-identical across the local and cloud profiles", async () => {
  const local = await bootLocal();
  const cloud = await bootCloud();
  try {
    const [localT, cloudT] = await Promise.all([
      battery(local.base),
      battery(cloud.base),
    ]);
    expect(localT.map((s) => s.label)).toEqual(cloudT.map((s) => s.label));
    expect(localT).toEqual(cloudT);
  } finally {
    local.host.stop();
    await new Promise<void>((r) => cloud.server.close(() => r()));
  }
});

test("the documented profile asymmetries are exactly the intended ones", async () => {
  const local = await bootLocal();
  const cloud = await bootCloud();
  try {
    const lc = (await (
      await fetch(`${local.base}/v1/capabilities`)
    ).json()) as Capabilities;
    const cc = (await (
      await fetch(`${cloud.base}/v1/capabilities`)
    ).json()) as Capabilities;

    expect(lc).toEqual({
      ...LOCAL_CAPABILITIES,
      integrations: ["custom"],
      customIntegrationOAuth: true,
      heartbeat: true,
    });
    expect(cc).toEqual(CLOUD_CAPABILITIES);
    expect(lc.missionTitleOnSend).toBeUndefined();
    expect(cc.missionTitleOnSend).toBeUndefined();
    expect(CLOUD_CAPABILITIES.integrations).toEqual(
      LOCAL_CAPABILITIES.integrations,
    );

    expect(lc.profile).toBe("local");
    expect(cc.profile).toBe("cloud");
    expect([lc.revealInOs, lc.terminal]).toEqual([true, true]);
    expect([cc.revealInOs, cc.terminal]).toEqual([false, false]);
    expect(lc.codeExecution).toBe("local-bash");
    expect(cc.codeExecution).toBe("remote-sandbox");
    expect(lc.providers).toEqual(LOCAL_CAPABILITIES.providers);
    expect(cc.providers).toEqual(CLOUD_CAPABILITIES.providers);
    expect(cc.providers).toEqual(lc.providers);
    expect(lc.openaiCompatible).toBe(true);
    expect(cc.openaiCompatible).toBe(true);

    const mk = async (base: string) =>
      (await (
        await fetch(`${base}/agents`, {
          method: "POST",
          headers: auth,
          body: JSON.stringify({ name: "DirProbe" }),
        })
      ).json()) as { id: string; dir?: string };
    const localAgent = await mk(local.base);
    const cloudAgent = await mk(cloud.base);
    expect(typeof localAgent.dir).toBe("string");
    expect(localAgent.dir?.split("\\").join("/").endsWith(localAgent.id)).toBe(
      true,
    );
    expect(cloudAgent.dir).toBeUndefined();

    expect(lc.tunnel).toBe(false);
    expect(cc.tunnel).toBe(false);
    const lv = (await (await fetch(`${local.base}/v1/version`)).json()) as {
      protocol: number;
    };
    const cv = (await (await fetch(`${cloud.base}/v1/version`)).json()) as {
      protocol: number;
    };
    expect(lv.protocol).toBe(PROTOCOL_VERSION);
    expect(cv.protocol).toBe(PROTOCOL_VERSION);
  } finally {
    local.host.stop();
    await new Promise<void>((r) => cloud.server.close(() => r()));
  }
});

test("an unauthenticated request is refused by both profiles", async () => {
  const local = await bootLocal();
  const cloud = await bootCloud();
  try {
    expect((await fetch(`${local.base}/agents`)).status).toBe(401);
    expect((await fetch(`${cloud.base}/agents`)).status).toBe(401);
    expect(
      (
        await fetch(`${local.base}/agents`, {
          headers: { Authorization: "Bearer nope" },
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await fetch(`${cloud.base}/agents`, {
          headers: { Authorization: "Bearer nope" },
        })
      ).status,
    ).toBe(401);
  } finally {
    local.host.stop();
    await new Promise<void>((r) => cloud.server.close(() => r()));
  }
});
