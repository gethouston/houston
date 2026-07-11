import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Capabilities, Workspace } from "@houston/protocol";
import {
  LocalDirStore,
  type ObjectStore,
} from "@houston/runtime-client/object-sync";
import { expect, test } from "vitest";
import { MANAGED_CLOUD_CAPABILITIES } from "../capabilities";
import { EnvCredentialVault } from "../credentials/vault";
import type { Agent } from "../domain/types";
import { MemoryMcpAuthStore } from "../integrations/mcp/auth-store";
import { HubCatalogSource } from "../integrations/mcp/hub-catalog-source";
import type { RuntimeSpawner } from "../launcher/process";
import {
  buildLocalHost,
  buildLocalIntegrationRegistry,
  formatIntegrationsModeLog,
  LOCAL_CAPABILITIES,
  type LocalHostOptions,
} from "./host";

/**
 * The local host wired end-to-end at the route level: the SAME server, driven
 * by the local adapter profile (LocalWorkspaceStore + FsVfs + LocalPaths +
 * SingleUserVerifier). No real runtime — the spawner is a fake, since these
 * routes (meta, workspaces, agents, preferences) never dispatch a turn.
 */

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const addr = s.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      s.close(() => resolve(port));
    });
  });
}

// A spawner that is never actually invoked here (no turn dispatch in this test).
const fakeSpawner: RuntimeSpawner = {
  spawn: () => ({ port: 0, kill: () => {} }),
};

async function setup(opts?: {
  chatHistoryDbPath?: string;
  capabilities?: Capabilities;
  integrations?: LocalHostOptions["integrations"];
  gatewayFronted?: boolean;
  credentials?: LocalHostOptions["credentials"];
  spawner?: RuntimeSpawner;
  eagerRuntime?: boolean;
  storeSync?: LocalHostOptions["storeSync"];
  waitForStart?: boolean;
}) {
  const houstonHome = mkdtempSync(join(tmpdir(), "houston-localhost-"));
  const workspacesRoot = join(houstonHome, "workspaces");
  mkdirSync(join(workspacesRoot, "Work", "Sales"), { recursive: true });
  const port = await freePort();
  const host = buildLocalHost({
    workspacesRoot,
    credentialsPath: join(houstonHome, "credentials.json"),
    port,
    token: "boot-secret",
    runtimeCommand: ["true"],
    spawner: opts?.spawner ?? fakeSpawner,
    chatHistoryDbPath: opts?.chatHistoryDbPath,
    capabilities: opts?.capabilities,
    integrations: opts?.integrations,
    gatewayFronted: opts?.gatewayFronted,
    credentials: opts?.credentials,
    eagerRuntime: opts?.eagerRuntime,
    storeSync: opts?.storeSync,
  });
  const startPromise = host.start();
  if (opts?.waitForStart !== false) await startPromise;
  return {
    host,
    base: `http://127.0.0.1:${port}`,
    houstonHome,
    startPromise,
    workspacesRoot,
  };
}

const auth = {
  Authorization: "Bearer boot-secret",
  "Content-Type": "application/json",
};

test("integration mode log identifies gateway mode and its upstream", () => {
  expect(
    formatIntegrationsModeLog({
      gatewayUrl: "https://cloud.test",
      composioApiKey: "must-not-appear",
    }),
  ).toBe("[local-host] integrations: gateway https://cloud.test");
});

test("integration mode log appends MCP servers after the primary provider", () => {
  const mcpServers = [
    {
      id: "composio-apps",
      url: "https://connect.composio.dev/mcp",
      redirectUrl: "http://localhost/callback",
    },
  ];
  expect(
    formatIntegrationsModeLog({
      gatewayUrl: "https://cloud.test",
      mcpServers,
    }),
  ).toBe(
    "[local-host] integrations: gateway https://cloud.test + mcp composio-apps (https://connect.composio.dev/mcp)",
  );
  expect(formatIntegrationsModeLog({ mcpServers })).toBe(
    "[local-host] integrations: mcp composio-apps (https://connect.composio.dev/mcp)",
  );
});

test("Composio stays first when MCP providers are also wired", () => {
  const wiring = buildLocalIntegrationRegistry(
    {
      gatewayUrl: "https://cloud.test",
      mcpServers: [
        {
          id: "composio-apps",
          url: "https://connect.composio.dev/mcp",
          redirectUrl: "http://localhost/callback",
        },
      ],
    },
    new MemoryMcpAuthStore(),
    new HubCatalogSource({ cachePath: "/dev/null", url: "" }),
    { current: null },
  );
  expect(wiring?.registry.ids()[0]).toBe("composio");
  expect(wiring?.registry.ids()).toEqual(["composio", "composio-apps"]);
});

test("integration mode log identifies direct mode without exposing the key", () => {
  const key = "must-not-appear";
  const line = formatIntegrationsModeLog({ composioApiKey: key });
  expect(line).toBe("[local-host] integrations: direct (own Composio key)");
  expect(line).not.toContain(key);
});

test("integration mode log explains how to enable integrations when off", () => {
  expect(formatIntegrationsModeLog(undefined)).toBe(
    "[local-host] integrations off: set HOUSTON_INTEGRATIONS_URL, COMPOSIO_API_KEY, or HOUSTON_MCP_INTEGRATIONS to enable",
  );
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test("does not listen until store hydration has completed", async () => {
  const remoteRoot = mkdtempSync(join(tmpdir(), "host-sync-remote-"));
  const delegate = new LocalDirStore(remoteRoot);
  const listGate = deferred<string[]>();
  const gatedStore: ObjectStore = {
    list: () => listGate.promise,
    download: (key, dest) => delegate.download(key, dest),
    upload: (source, key) => delegate.upload(source, key),
    delete: (key) => delegate.delete(key),
  };
  const { base, host, startPromise } = await setup({
    storeSync: { store: gatedStore },
    waitForStart: false,
  });
  await expect(fetch(`${base}/health`)).rejects.toThrow();
  listGate.resolve([]);
  await startPromise;
  expect((await fetch(`${base}/health`)).status).toBe(200);
  await host.stop();
});

test("stop uploads local changes before closing the host", async () => {
  const remoteRoot = mkdtempSync(join(tmpdir(), "host-sync-remote-"));
  const remote = new LocalDirStore(remoteRoot);
  const { host, workspacesRoot } = await setup({
    storeSync: { store: remote, quietMs: 60_000, intervalMs: 60_000 },
  });
  writeFileSync(join(workspacesRoot, "Work", "Sales", "final.txt"), "durable");
  await host.stop();
  expect(
    readFileSync(
      join(remoteRoot, "workspaces", "Work", "Sales", "final.txt"),
      "utf8",
    ),
  ).toBe("durable");
});

test("capabilities report the local profile", async () => {
  const { host, base } = await setup();
  try {
    const r = await fetch(`${base}/v1/capabilities`);
    expect(r.status).toBe(200);
    const caps = (await r.json()) as Capabilities;
    // Integration availability is CONFIG-driven: this boot wired no gateway
    // URL and no platform key, so the served list is honestly empty.
    expect(caps).toEqual({ ...LOCAL_CAPABILITIES, integrations: [] });
    expect(caps.profile).toBe("local");
    expect(caps.codeExecution).toBe("local-bash");
    expect(caps.providers).toContain("anthropic");
    expect(caps.providers).toContain("amazon-bedrock");
  } finally {
    host.stop();
  }
});

test("capabilities can report the managed cloud pod profile", async () => {
  const { host, base } = await setup({
    capabilities: MANAGED_CLOUD_CAPABILITIES,
  });
  try {
    const r = await fetch(`${base}/v1/capabilities`);
    expect(r.status).toBe(200);
    const caps = (await r.json()) as Capabilities;
    expect(caps).toEqual({ ...MANAGED_CLOUD_CAPABILITIES, integrations: [] });
    // Pods run the agent's bash in the single-tenant container (HOU-669).
    expect(caps.codeExecution).toBe("local-bash");
    // Managed pods offer the full provider set plus a BYO OpenAI-compatible
    // endpoint (public-HTTPS, validated on save).
    expect(caps.providers).toContain("amazon-bedrock");
    expect(caps.providers).toContain("anthropic");
    expect(caps.openaiCompatible).toBe(true);
  } finally {
    host.stop();
  }
});

test("managed credential config serves sandbox credentials from the gateway", async () => {
  const orgSlug = "0011223344556677";
  const agentSlug = "8899aabbccddeeff";
  const seen: { url?: string; auth?: string }[] = [];
  const gateway = createHttpServer((req, res) => {
    seen.push({ url: req.url, auth: req.headers.authorization });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        provider: "openai-codex",
        kind: "oauth",
        access: "AT-org",
        expires: 1_730_000_000_000,
        accountId: null,
        enterpriseUrl: null,
      }),
    );
  });
  await new Promise<void>((r) => gateway.listen(0, "127.0.0.1", () => r()));
  try {
    const addr = gateway.address();
    const gatewayUrl = `http://127.0.0.1:${
      typeof addr === "object" && addr ? addr.port : 0
    }`;
    const { host, base } = await setup({
      credentials: {
        url: gatewayUrl,
        orgSlug,
        agentSlug,
        podToken: "pod-secret",
      },
    });
    try {
      const sbx = new EnvCredentialVault({
        secret: "boot-secret",
      }).sandboxToken("Work", "Work/Sales");
      const r = await fetch(
        `${base}/sandbox/credential?provider=openai-codex`,
        {
          headers: { Authorization: `Bearer ${sbx}` },
        },
      );
      expect(r.status).toBe(200);
      expect(await r.json()).toMatchObject({
        provider: "openai-codex",
        access: "AT-org",
        kind: "oauth",
      });
      const first = seen.at(0);
      if (!first) throw new Error("expected a gateway credential request");
      expect(first.url).toBe(
        `/v1/pod/credentials/${orgSlug}/${agentSlug}/openai-codex`,
      );
      expect(first.auth).toBe("Bearer pod-secret");
    } finally {
      host.stop();
    }
  } finally {
    await new Promise<void>((r) => gateway.close(() => r()));
  }
});

test("a configured integrations gateway advertises composio and wins over a direct key", async () => {
  const { host, base } = await setup({
    // Both configured (the dev prod-simulation shape) → the gateway wins, so
    // the signin-gated remote adapter is what serves, never the direct key.
    integrations: {
      gatewayUrl: "https://cloud.test",
      composioApiKey: "pk_ignored",
    },
  });
  try {
    const caps = (await (
      await fetch(`${base}/v1/capabilities`)
    ).json()) as Capabilities;
    expect(caps.integrations).toEqual(["composio"]);
    // Desktop gateway before sign-in: present but signin-gated, never a 503.
    const status = await (
      await fetch(`${base}/v1/integrations`, { headers: auth })
    ).json();
    expect(status.items).toEqual([
      { provider: "composio", ready: false, reason: "signin" },
    ]);
  } finally {
    host.stop();
  }
});

test("/v1/version reports chatHistoryMigrated=false on a fresh install", async () => {
  const { host, base } = await setup();
  try {
    const v = (await (await fetch(`${base}/v1/version`)).json()) as {
      chatHistoryMigrated: boolean;
    };
    // No legacy db path → not a migrating install; the reconnect moment must
    // never fire for fresh users.
    expect(v.chatHistoryMigrated).toBe(false);
  } finally {
    host.stop();
  }
});

test("/v1/version reports chatHistoryMigrated=true when a legacy db is present", async () => {
  // The flag keys on the db FILE existing (the durable "came from the legacy
  // desktop build" signal), independent of whether the migration parse runs —
  // an unreadable/empty file still marks the user as migrating, and start()
  // swallows the parse failure. We point at a real, present file.
  const dbPath = join(
    mkdtempSync(join(tmpdir(), "houston-legacydb-")),
    "houston.db",
  );
  writeFileSync(dbPath, "");
  const { host, base } = await setup({ chatHistoryDbPath: dbPath });
  try {
    const v = (await (await fetch(`${base}/v1/version`)).json()) as {
      chatHistoryMigrated: boolean;
    };
    expect(v.chatHistoryMigrated).toBe(true);
  } finally {
    host.stop();
  }
});

test("the boot token is required; anything else is 401", async () => {
  const { host, base } = await setup();
  try {
    expect((await fetch(`${base}/agents`)).status).toBe(401);
    expect(
      (
        await fetch(`${base}/agents`, {
          headers: { Authorization: "Bearer nope" },
        })
      ).status,
    ).toBe(401);
    expect((await fetch(`${base}/agents`, { headers: auth })).status).toBe(200);
  } finally {
    host.stop();
  }
});

test("workspaces + agents are read from the on-disk desktop tree", async () => {
  const { host, base } = await setup();
  try {
    const workspaces = (await (
      await fetch(`${base}/v1/workspaces`, { headers: auth })
    ).json()) as Workspace[];
    expect(workspaces.map((w) => w.id)).toEqual(["Work"]);

    // GET /agents lists the (default = first) workspace's agents.
    const agents = (await (
      await fetch(`${base}/agents`, { headers: auth })
    ).json()) as Agent[];
    expect(agents.map((a) => a.id)).toEqual(["Work/Sales"]);
  } finally {
    host.stop();
  }
});

test("a slash-bearing agent id round-trips through the URL (encode → decode)", async () => {
  const { host, base } = await setup();
  try {
    // The activities route is served by the host (no runtime needed); reaching
    // it proves /agents/Work%2FSales/... decodes back to the "Work/Sales" agent.
    const r = await fetch(
      `${base}/agents/${encodeURIComponent("Work/Sales")}/activities`,
      { headers: auth },
    );
    expect(r.status).toBe(200);
    const body = (await r.json()) as { items: unknown[] };
    expect(body.items).toEqual([]);
  } finally {
    host.stop();
  }
});

// ── acting-as relay (C2): the managed pod is gateway-fronted ─────────────────

/**
 * A fake runtime: a live HTTP server whose port the spawner hands to the
 * launcher. /health satisfies the launcher's readiness probe; every other
 * request records its headers so the test can see what the proxy relayed.
 */
function fakeRuntime() {
  const seen: Record<string, string | string[] | undefined>[] = [];
  const server = createHttpServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200);
      res.end("ok");
      return;
    }
    seen.push({ ...req.headers });
    res.writeHead(202, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });
  const spawner: RuntimeSpawner = {
    spawn: () => ({
      port: (server.address() as { port: number }).port,
      kill: () => {},
    }),
  };
  return {
    seen,
    spawner,
    listen: () =>
      new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r())),
    close: () => server.close(),
  };
}

async function relayActingHeader(gatewayFronted: boolean | undefined) {
  const rt = fakeRuntime();
  await rt.listen();
  const { host, base } = await setup({ spawner: rt.spawner, gatewayFronted });
  try {
    const r = await fetch(
      `${base}/agents/${encodeURIComponent("Work/Sales")}/conversations/c1/messages`,
      {
        method: "POST",
        headers: { ...auth, "x-houston-acting-as": "acting-v1.payload.sig" },
        body: JSON.stringify({ text: "hi" }),
      },
    );
    expect(r.status).toBe(202);
    return rt.seen[0] ?? {};
  } finally {
    host.stop();
    rt.close();
  }
}

test("managed pod (gatewayFronted): the gateway-minted acting-as header reaches the runtime", async () => {
  // The bug this locks down: the pod profile dropping the header meant the
  // runtime had no acting identity, so every integration call in a cloud chat
  // died signin-required and agents claimed connected apps weren't connected.
  const headers = await relayActingHeader(true);
  expect(headers["x-houston-acting-as"]).toBe("acting-v1.payload.sig");
});

test("desktop (default): a client-supplied acting-as header is dropped", async () => {
  const headers = await relayActingHeader(undefined);
  expect(headers["x-houston-acting-as"]).toBeUndefined();
});

test("preferences persist via the vfs under the workspace", async () => {
  const { host, base } = await setup();
  try {
    await fetch(`${base}/v1/preferences/locale`, {
      method: "PUT",
      headers: auth,
      body: JSON.stringify({ value: "es" }),
    });
    const got = await fetch(`${base}/v1/preferences/locale`, { headers: auth });
    expect(((await got.json()) as { value: string }).value).toBe("es");
  } finally {
    host.stop();
  }
});

test("eagerRuntime spawns the stored agents' runtimes at start, lazily otherwise", async () => {
  // A real /health endpoint the launcher's poll can succeed against — the
  // fake spawner hands out its port so ensureAwake completes.
  const health = createHttpServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end('{"status":"ok"}');
  });
  await new Promise<void>((r) => {
    health.listen(0, "127.0.0.1", () => r());
  });
  const healthAddr = health.address();
  const healthPort =
    typeof healthAddr === "object" && healthAddr ? healthAddr.port : 0;
  const spawned: string[] = [];
  const recordingSpawner: RuntimeSpawner = {
    spawn: (spec) => {
      spawned.push(spec.workspaceDir);
      return { port: healthPort, kill: () => {} };
    },
  };

  const eager = await setup({ spawner: recordingSpawner, eagerRuntime: true });
  try {
    // Fire-and-forget after listen: poll until the spawn landed.
    const deadline = Date.now() + 5_000;
    while (spawned.length === 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 25));
    }
    expect(spawned).toHaveLength(1);
    expect(spawned[0]).toContain(join("Work", "Sales"));
  } finally {
    eager.host.stop();
  }

  // Control: without the flag nothing spawns until a dispatch asks.
  spawned.length = 0;
  const lazy = await setup({ spawner: recordingSpawner });
  try {
    await new Promise((r) => setTimeout(r, 200));
    expect(spawned).toHaveLength(0);
  } finally {
    lazy.host.stop();
    await new Promise<void>((r) => health.close(() => r()));
  }
});
