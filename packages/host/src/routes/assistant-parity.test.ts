import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createServer as createHttpServer, type Server } from "node:http";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { AssistantCatalog } from "../assistant/catalog";
import { processAssistantCatalog } from "../assistant/catalog-source";
import type { RuntimeSpawner } from "../launcher/process";
import { buildLocalHost } from "../local/host";
import { CLOUD_ONLY_PROBES } from "./assistant-parity-cloud-probes";
import { LOCAL_PROBES } from "./assistant-parity-local-probes";
import {
  PROBE_AGENT,
  PROBE_WORKSPACE,
  WRITE_DRIVEN_OPERATIONS,
} from "./assistant-parity-probes";
import { buildBody, buildPath, buildQuery } from "./assistant-request-parts";

const SENTINEL_STATUS = 599;
const SENTINEL_BODY = "assistant-parity-runtime-sentinel";

const ROUTE_MISS = '{"error":"not found"}';

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

const runtimes: Server[] = [];
const sentinelSpawner: RuntimeSpawner = {
  spawn: (spec) => {
    const server = createHttpServer((req, res) => {
      if (req.method === "GET" && req.url?.split("?")[0] === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end('{"ok":true}');
        return;
      }
      res.writeHead(SENTINEL_STATUS, { "Content-Type": "text/plain" });
      res.end(SENTINEL_BODY);
    });
    server.listen(spec.port, "127.0.0.1");
    runtimes.push(server);
    return { port: spec.port, kill: () => server.close() };
  },
};

const loaded = processAssistantCatalog();
if (!loaded) throw new Error("the embedded assistant catalog must load");
const catalog: AssistantCatalog = loaded;

function request(operation: string, params: Record<string, unknown>) {
  const op = catalog.operations.find((entry) => entry.name === operation);
  if (!op?.route) throw new Error(`${operation} carries no route`);
  const path = buildPath(op.route, params);
  if (!path.ok) throw new Error(`${operation}: ${path.refusal.message}`);
  const query = buildQuery(op.route, params);
  if (!query.ok) throw new Error(`${operation}: ${query.refusal.message}`);
  return {
    method: op.route.method,
    path: path.value,
    query: query.value,
    body: buildBody(op.route, params),
  };
}

let base = "";
let host: { start(): Promise<void>; stop(): Promise<void> | void };

beforeAll(async () => {
  const home = mkdtempSync(join(tmpdir(), "houston-assistant-parity-"));
  const workspacesRoot = join(home, "workspaces");
  const agentDir = join(workspacesRoot, ...PROBE_AGENT.split("/"));
  mkdirSync(agentDir, { recursive: true });
  writeFileSync(join(agentDir, "CLAUDE.md"), "# Sales\n");
  const port = await freePort();
  host = buildLocalHost({
    workspacesRoot,
    credentialsPath: join(home, "credentials.json"),
    port,
    token: "boot-secret",
    runtimeCommand: ["true"],
    spawner: sentinelSpawner,
  });
  base = `http://127.0.0.1:${port}`;
  await host.start();
  const wake = await fetch(
    `${base}/agents/${encodeURIComponent(PROBE_AGENT)}/health`,
    { headers: { Authorization: "Bearer boot-secret" } },
  );
  await wake.text();
});

afterAll(async () => {
  await host.stop();
  for (const server of runtimes) server.close();
});

async function call(operation: string, params: Record<string, unknown>) {
  const built = request(operation, params);
  const url = new URL(`${base}${built.path}`);
  for (const [key, value] of Object.entries(built.query)) {
    url.searchParams.set(key, value);
  }
  const res = await fetch(url, {
    method: built.method,
    headers: {
      Authorization: "Bearer boot-secret",
      "Content-Type": "application/json",
    },
    ...(built.body !== undefined ? { body: JSON.stringify(built.body) } : {}),
  });
  return { path: built.path, status: res.status, body: await res.text() };
}

describe("the probe tables cover the catalog", () => {
  const routable = catalog.operations.filter((op) => op.route !== null);
  const covered = [
    ...LOCAL_PROBES.map((probe) => probe.operation),
    ...CLOUD_ONLY_PROBES.map((probe) => probe.operation),
    ...WRITE_DRIVEN_OPERATIONS,
  ];

  test("every visible routable operation is probed", () => {
    const seen = new Set(covered);
    const unprobed = routable
      .filter((op) => !op.hidden && !seen.has(op.name))
      .map((op) => op.name);
    expect(unprobed).toEqual([]);
  });

  test("no probe names an operation this catalog cannot dispatch", () => {
    const dispatchable = new Set(routable.map((op) => op.name));
    expect(covered.filter((name) => !dispatchable.has(name))).toEqual([]);
  });

  test("an operation is covered in exactly one place", () => {
    const duplicated = covered.filter(
      (name, index) => covered.indexOf(name) !== index,
    );
    expect(duplicated).toEqual([]);
  });
});

describe("catalog operations address the local host's real routes", () => {
  test.each(
    LOCAL_PROBES.map((probe) => [probe.operation, probe] as const),
  )("%s resolves to a live route", async (_name, probe) => {
    const res = await call(probe.operation, probe.params);
    expect(`${res.path} -> ${res.status} ${res.body.slice(0, 120)}`).not.toBe(
      `${res.path} -> 404 ${ROUTE_MISS}`,
    );
    if (probe.runtimeProxied) {
      expect(`${res.status} ${res.body}`, probe.runtimeProxied.reason).toBe(
        `${SENTINEL_STATUS} ${SENTINEL_BODY}`,
      );
      return;
    }
    expect(res.body).not.toContain(SENTINEL_BODY);
    expect(res.status).not.toBe(SENTINEL_STATUS);
    if (probe.serviceState) {
      expect(res.status, probe.serviceState.reason).toBe(
        probe.serviceState.status,
      );
      return;
    }
    expect(res.status).toBeLessThan(500);
  });
});

describe("cloud-only operations are absent locally, on purpose", () => {
  test.each(
    CLOUD_ONLY_PROBES.map((probe) => [probe.operation, probe] as const),
  )("%s misses locally", async (_name, probe) => {
    const res = await call(probe.operation, probe.params);
    expect(
      `${res.status} ${res.body}`,
      `${probe.operation} is listed cloud-only because ${probe.reason}`,
    ).toBe(`404 ${ROUTE_MISS}`);
  });
});

describe("path escaping matches the adapter's", () => {
  test("a segment parameter is escaped whole", () => {
    expect(request("listActivities", { agentId: PROBE_AGENT }).path).toBe(
      "/agents/Work%2FSales/activities",
    );
  });

  test("a path parameter keeps its separators", () => {
    expect(
      request("readAgentFile", {
        agentId: PROBE_AGENT,
        relPath: "board/activity one.json",
      }).path,
    ).toBe("/agents/Work%2FSales/agentfile/board/activity%20one.json");
  });

  test("every workspace-scoped probe addresses the seeded workspace", () => {
    expect(
      request("listSharedSkills", { workspaceId: PROBE_WORKSPACE }).path,
    ).toBe("/v1/workspaces/Work/shared-skills");
  });
});

describe("the SDK write operations act on the real host", () => {
  const json = (body: string): Record<string, unknown> =>
    JSON.parse(body) as Record<string, unknown>;
  let missionId = "";
  let probeAgent = "";

  test("the manager's suggestion toggle round-trips through the catalog", async () => {
    for (const value of ["false", "true"]) {
      const written = await call("preferences.setNextStepSuggestions", {
        value,
      });
      expect(written.status).toBe(200);
      expect(json(written.body).value).toBe(value);
      const read = await call("preferences.getNextStepSuggestions", {});
      expect(read.status).toBe(200);
      expect(json(read.body).value).toBe(value);
    }
  });

  test("createActivity puts a real mission on the board", async () => {
    const created = await call("createActivity", {
      agentId: PROBE_AGENT,
      input: { title: "Parity probe mission" },
    });
    expect(created.status).toBeLessThan(300);
    missionId = String(json(created.body).id ?? "");
    expect(missionId).not.toBe("");

    const listed = await call("listActivities", { agentId: PROBE_AGENT });
    expect(listed.body).toContain("Parity probe mission");
  });

  test("deleteActivity takes it off again", async () => {
    const removed = await call("deleteActivity", {
      agentId: PROBE_AGENT,
      id: missionId,
    });
    expect(removed.status).toBeLessThan(300);

    const listed = await call("listActivities", { agentId: PROBE_AGENT });
    expect(listed.body).not.toContain("Parity probe mission");
  });

  const storedColors = async (): Promise<Record<string, string>> => {
    const read = await call("getPreference", { key: "agent_colors" });
    const value = json(read.body).value;
    return typeof value === "string"
      ? (JSON.parse(value) as Record<string, string>)
      : {};
  };

  test("createAgent adds an agent, already wearing its color", async () => {
    const created = await call("createAgent", {
      name: "Parity Probe",
      color: "forest",
    });
    expect(created.status).toBeLessThan(300);
    probeAgent = String(json(created.body).id ?? "");
    expect(probeAgent).not.toBe("");
    expect((await storedColors())[probeAgent]).toBe("forest");
  });

  test("renameAgent renames it", async () => {
    const renamed = await call("renameAgent", {
      id: probeAgent,
      name: "Parity Probe Renamed",
    });
    expect(renamed.status).toBeLessThan(300);
    probeAgent = String(json(renamed.body).id ?? probeAgent);
    expect(probeAgent).toContain("Parity Probe Renamed");
    expect((await storedColors())[probeAgent]).toBe("forest");
  });

  test("updateAgentColor recolors it in the store the app renders from", async () => {
    const recolored = await call("updateAgentColor", {
      agentId: probeAgent,
      color: "teal",
    });
    expect(recolored.status).toBeLessThan(300);
    expect((await storedColors())[probeAgent]).toBe("teal");
  });

  test("deleteAgent removes it, color and all", async () => {
    const removed = await call("deleteAgent", { id: probeAgent });
    expect(removed.status).toBeLessThan(300);

    const listed = await call("listAgents", {});
    expect(listed.body).not.toContain("Parity Probe Renamed");
    expect(probeAgent in (await storedColors())).toBe(false);
  });
});
