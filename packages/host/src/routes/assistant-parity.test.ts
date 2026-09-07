import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createServer as createHttpServer, type Server } from "node:http";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { AssistantCatalog } from "../assistant/catalog";
import { loadAssistantCatalog } from "../assistant/catalog";
import { DEFAULT_ASSISTANT_CATALOG_PATH } from "../assistant/catalog-source";
import type { RuntimeSpawner } from "../launcher/process";
import { buildLocalHost } from "../local/host";
import {
  CLOUD_ONLY_PROBES,
  LOCAL_PROBES,
  PROBE_AGENT,
  PROBE_WORKSPACE,
} from "./assistant-parity-probes";
import { buildBody, buildPath, buildQuery } from "./assistant-request-parts";

/**
 * The decisive regression guard for the generated catalog: every routable
 * operation's address must resolve to a real handler on the SAME host the app
 * talks to. The catalog is derived from the engine adapter, and the adapter,
 * the local host and the hosted gateway all serve one surface — so a catalog
 * path the local host cannot address is a generator bug, not a variant.
 *
 * `/agents/:id/<anything>` is a CATCH-ALL that proxies whatever it does not
 * recognise to the agent's runtime, so "no 404" alone proves nothing. The
 * spawner below therefore serves a real sentinel: a probe answered by it fell
 * THROUGH the host's route table, and the test fails exactly as it should.
 */

/** What the stand-in runtime answers, so a proxied request is unmistakable. */
const SENTINEL_STATUS = 599;
const SENTINEL_BODY = "assistant-parity-runtime-sentinel";

/** The router's own terminal answer for a path no handler claimed. */
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
    const server = createHttpServer((_req, res) => {
      res.writeHead(SENTINEL_STATUS, { "Content-Type": "text/plain" });
      res.end(SENTINEL_BODY);
    });
    server.listen(spec.port, "127.0.0.1");
    runtimes.push(server);
    return { port: spec.port, kill: () => server.close() };
  },
};

const loaded = loadAssistantCatalog(DEFAULT_ASSISTANT_CATALOG_PATH);
if (!loaded) throw new Error("the generated assistant catalog must load");
const catalog: AssistantCatalog = loaded;

/**
 * The request one catalog operation makes, built by the SAME code the
 * dispatcher builds it with. It resolves the operation by name rather than
 * through `findVisibleOperation` on purpose: whether an operation is withheld
 * from the agent is a policy question, and re-tagging one `hidden` must not
 * quietly retire the guard that its address still resolves.
 */
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
});

afterAll(async () => {
  await host.stop();
  for (const server of runtimes) server.close();
});

/** Drive one catalog operation against the running host. */
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

describe("catalog operations address the local host's real routes", () => {
  test.each(
    LOCAL_PROBES.map((probe) => [probe.operation, probe] as const),
  )("%s resolves to a live route", async (_name, probe) => {
    const res = await call(probe.operation, probe.params);
    // A route the host never claimed: the catalog and the host disagree.
    expect(`${res.path} -> ${res.status} ${res.body.slice(0, 120)}`).not.toBe(
      `${res.path} -> 404 ${ROUTE_MISS}`,
    );
    expect(res.body).not.toContain(SENTINEL_BODY);
    expect(res.status).not.toBe(SENTINEL_STATUS);
    // 5xx means the address landed nowhere serviceable (a proxy attempt, a
    // crash); a real handler answers 2xx or a 4xx it authored itself.
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
  // The agent id is a workspace-relative PATH locally, so a segment parameter
  // must arrive escaped whole; a relative file path must keep its separators.
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

/**
 * The four write operations the SDK owns, driven end to end against the real
 * host. Reads prove an address resolves; only a write proves the METHOD, the
 * body mapping and the id round-trip are right — and "create a mission" is the
 * assistant's headline capability, so it is guarded by its effect, not by a
 * status code. Everything created here is cleaned up by the operation under
 * test, which is what makes the delete probes meaningful.
 *
 * Ordered and last on purpose: these mutate the host the read probes above
 * share, so they run only once those have finished.
 */
describe("the SDK write operations act on the real host", () => {
  const json = (body: string): Record<string, unknown> =>
    JSON.parse(body) as Record<string, unknown>;
  let missionId = "";
  let probeAgent = "";

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

  test("createAgent adds an agent to rename and delete", async () => {
    const created = await call("createAgent", { name: "Parity Probe" });
    expect(created.status).toBeLessThan(300);
    probeAgent = String(json(created.body).id ?? "");
    expect(probeAgent).not.toBe("");
  });

  test("renameAgent renames it", async () => {
    const renamed = await call("renameAgent", {
      id: probeAgent,
      name: "Parity Probe Renamed",
    });
    expect(renamed.status).toBeLessThan(300);
    // A local agent's id IS its workspace path, so a rename MOVES it; the
    // delete below must follow the id the host answered with, not the old one.
    probeAgent = String(json(renamed.body).id ?? probeAgent);
    expect(probeAgent).toContain("Parity Probe Renamed");
  });

  test("deleteAgent removes it", async () => {
    const removed = await call("deleteAgent", { id: probeAgent });
    expect(removed.status).toBeLessThan(300);

    const listed = await call("listAgents", {});
    expect(listed.body).not.toContain("Parity Probe Renamed");
  });
});
