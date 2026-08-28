import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
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
      : Response.json({ revision: 1 });
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
    resolved: { store, prefix: "ws/w1/agent-1" },
    requests,
  };
}

test("a durable turn names the conversation and board as changed", async () => {
  const { deps, turn, filesystem, resolved } = await claimedTurn(200);
  filesystem.immediateWrites.add(
    `${workspaceRel}/.houston/routines/routines.json`,
  );
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

test("turn tool mutations publish the skills and custom definition views", async () => {
  const { deps, turn, filesystem, resolved, requests } = await claimedTurn(200);
  filesystem.immediateWrites.add(
    `${workspaceRel}/.agents/skills/example/SKILL.md`,
  );
  filesystem.immediateWrites.add("custom-integrations.json");
  const result = await finishTurnDurability({
    deps,
    turn,
    filesystem,
    resolved,
    heartbeat: null,
    outcome: {},
    transcript: null,
    views: {
      skills: { items: [{ name: "example" }], diagnostics: [] },
      customDefinitions: { items: [{ slug: "example" }] },
    },
  });

  const viewPuts = requests.filter(
    (request) =>
      request.method === "PUT" &&
      /\/(skills|custom_definitions)$/.test(request.url),
  );
  expect(viewPuts).toEqual([
    {
      url: "https://store.example/v1/pod/docs/w1/agent-1/skills",
      method: "PUT",
      body: JSON.stringify({
        doc: { items: [{ name: "example" }], diagnostics: [] },
      }),
    },
    {
      url: "https://store.example/v1/pod/docs/w1/agent-1/custom_definitions",
      method: "PUT",
      body: JSON.stringify({ doc: { items: [{ slug: "example" }] } }),
    },
  ]);
  expect(result.changed).toEqual(
    expect.arrayContaining(["SkillsChanged", "CustomIntegrationsChanged"]),
  );
});
