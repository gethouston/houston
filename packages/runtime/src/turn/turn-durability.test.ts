import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { viewOf } from "@houston/host/src/integrations/custom/views";
import { LocalDirStore } from "@houston/runtime-client/object-sync";
import { expect, test } from "vitest";
import type { TurnServerDeps } from "./server-types";
import { finishTurnDurability } from "./turn-durability";
import { prepareTurnFilesystem } from "./turn-filesystem";
import type { TurnRequest } from "./types";

async function seed(root: string, rel: string, content: string) {
  const path = join(root, ...rel.split("/"));
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}

const dataRel = "workspaces/W/A/.houston/runtime";
const workspaceRel = "workspaces/W/A";

/** A claimed turn over a seeded standing layout, with the doc store stubbed. */
async function claimedTurn(docPutStatus: number) {
  const storeRoot = await mkdtemp(join(tmpdir(), "turn-durability-"));
  const prefixRoot = join(storeRoot, "ws", "w1", "agent-1");
  await seed(prefixRoot, `${dataRel}/settings.json`, "{}");
  await seed(prefixRoot, `${dataRel}/conversations/c1.json`, '{"before":1}');
  await seed(prefixRoot, `${workspaceRel}/CLAUDE.md`, "# A\n");
  const store = new LocalDirStore(storeRoot);
  const root = await mkdtemp(join(tmpdir(), "turn-root-"));
  const filesystem = await prepareTurnFilesystem({
    store,
    prefix: "ws/w1/agent-1",
    root,
    claimed: true,
  });
  // The turn rewrites its conversation and moves the board.
  await seed(filesystem.dataDir, "conversations/c1.json", '{"after":1}');
  await seed(
    filesystem.workspaceDir,
    ".houston/activity/activity.json",
    '[{"id":"a1","title":"Plan","status":"running"}]',
  );
  const requests: Array<{ url: string; method: string; body?: string }> = [];
  const fetchImpl = (async (url: unknown, init?: RequestInit) => {
    requests.push({
      url: String(url),
      method: init?.method ?? "GET",
      ...(typeof init?.body === "string" ? { body: init.body } : {}),
    });
    return init?.method === "PUT"
      ? new Response("{}", { status: docPutStatus })
      : Response.json({ doc: [], revision: 1 });
  }) as typeof fetch;
  const deps = {
    poolStoreUrl: "https://store.example",
    fetchImpl,
    activityDocRetryDelaysMs: [],
  } as unknown as TurnServerDeps;
  const turn = {
    shadow: false,
    claim: { id: "c", token: "t", bootId: "b", heartbeatUrl: "https://x" },
    hostToken: "host-token",
    gcsPrefix: "ws/w1/agent-1",
    conversationId: "c1",
    turnId: "turn-1",
  } as unknown as TurnRequest & { turnId: string };
  return {
    deps,
    turn,
    filesystem,
    prefixRoot,
    resolved: { store, prefix: "ws/w1/agent-1" },
    requests,
  };
}

/** A routines.json the turn wrote straight to the store (a CAS write). */
async function routinesWrite({
  filesystem,
  prefixRoot,
}: Pick<Awaited<ReturnType<typeof claimedTurn>>, "filesystem" | "prefixRoot">) {
  const body = JSON.stringify([
    {
      id: "r1",
      name: "Minutely",
      prompt: "check",
      schedule: "* * * * *",
      enabled: false,
      auto_paused: {
        reason: "model_unavailable",
        provider: "openai-codex",
        failures: 10,
        at: "2026-09-29T22:00:00.000Z",
      },
    },
  ]);
  const rel = ".houston/routines/routines.json";
  await seed(filesystem.workspaceDir, rel, body);
  await seed(prefixRoot, `${workspaceRel}/${rel}`, body);
  filesystem.immediateWrites.add(
    `${workspaceRel}/.houston/routines/routines.json`,
  );
}

test("a durable turn names the conversation and board as changed", async () => {
  const turnState = await claimedTurn(200);
  const { deps, turn, filesystem, resolved } = turnState;
  await routinesWrite(turnState);
  filesystem.immediateWrites.add("custom-integrations.json");
  const result = await finishTurnDurability({
    deps,
    turn,
    filesystem,
    resolved,
    heartbeat: null,
    outcome: {},
    transcript: null,
  });
  expect(result.outcome).toEqual({});
  expect(result.changed).toEqual([
    "ActivityChanged",
    "ConversationsChanged",
    "CustomIntegrationsChanged",
    "RoutinesChanged",
  ]);
});

test("a family whose doc projection failed is not announced", async () => {
  // The board file landed but its doc did not: other tabs refetching the
  // board would fall to the pod. The conversation (transcript-served) stays.
  const { deps, turn, filesystem, resolved } = await claimedTurn(400);
  const result = await finishTurnDurability({
    deps,
    turn,
    filesystem,
    resolved,
    heartbeat: null,
    outcome: {},
    transcript: null,
  });
  expect(result.outcome.error).toMatch(/board doc publish failed/);
  expect(result.changed).toEqual(["ConversationsChanged"]);
});

test("turn tool mutations publish the custom definition view", async () => {
  const turnState = await claimedTurn(200);
  const { deps, turn, filesystem, resolved, requests, prefixRoot } = turnState;
  // The tool's CAS write landed the definition in the store.
  const def = {
    kind: "mcp" as const,
    slug: "example",
    name: "Example",
    endpoint: "https://mcp.example.test",
    auth: "credential" as const,
    addedAtMs: 1,
  };
  await seed(
    prefixRoot,
    "custom-integrations.json",
    JSON.stringify({ version: 1, items: [def] }),
  );
  filesystem.immediateWrites.add("custom-integrations.json");
  const entry = viewOf(def, { status: "pending", authMethods: [] }, []);
  const result = await finishTurnDurability({
    deps,
    turn,
    filesystem,
    resolved,
    heartbeat: null,
    outcome: {},
    transcript: null,
    views: {
      customDefinitions: {
        view: { items: [entry] },
        defs: [def],
        touched: new Set(["example"]),
      },
    },
  });

  const viewPuts = requests.filter(
    (request) =>
      request.method === "PUT" && request.url.endsWith("/custom_definitions"),
  );
  expect(viewPuts).toEqual([
    {
      url: "https://store.example/v1/pod/docs/w1/agent-1/custom_definitions",
      method: "PUT",
      body: JSON.stringify({ doc: { items: [entry] } }),
    },
  ]);
  expect(result.changed).toEqual(
    expect.arrayContaining(["CustomIntegrationsChanged"]),
  );
});

test("a routines write republishes the routines doc the asleep Routines tab reads", async () => {
  const turnState = await claimedTurn(200);
  const { deps, turn, filesystem, resolved, requests } = turnState;
  await routinesWrite(turnState);
  const result = await finishTurnDurability({
    deps,
    turn,
    filesystem,
    resolved,
    heartbeat: null,
    outcome: {},
    transcript: null,
  });

  const puts = requests.filter(
    (request) => request.method === "PUT" && request.url.endsWith("/routines"),
  );
  expect(puts).toHaveLength(1);
  expect(puts[0]?.url).toBe(
    "https://store.example/v1/pod/docs/w1/agent-1/routines",
  );
  // NORMALIZED like the standing projector, the engine's pause kept.
  expect(JSON.parse(puts[0]?.body ?? "{}").doc).toEqual([
    expect.objectContaining({
      id: "r1",
      enabled: false,
      chat_mode: "shared",
      auto_paused: expect.objectContaining({ reason: "model_unavailable" }),
    }),
  ]);
  expect(result.changed).toContain("RoutinesChanged");
});

test("a routines doc that did not land is not announced", async () => {
  const turnState = await claimedTurn(400);
  const { deps, turn, filesystem, resolved } = turnState;
  await routinesWrite(turnState);
  const result = await finishTurnDurability({
    deps,
    turn,
    filesystem,
    resolved,
    heartbeat: null,
    outcome: {},
    transcript: null,
  });
  expect(result.outcome.error).toMatch(/routines doc publish failed/);
  expect(result.changed).not.toContain("RoutinesChanged");
});
