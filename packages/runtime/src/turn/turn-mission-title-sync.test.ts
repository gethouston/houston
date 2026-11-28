import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  LocalDirStore,
  type ObjectStore,
  StoreConflictError,
} from "@houston/runtime-client/object-sync";
import { afterEach, expect, test, vi } from "vitest";
import type { TurnServerDeps } from "./server-types";
import { finishTurnDurability } from "./turn-durability";
import { prepareTurnFilesystem } from "./turn-filesystem";
import { landedMissionTitle } from "./turn-mission-title-outcome";
import { durableTerminalFrame } from "./turn-terminal";
import type { TurnRequest } from "./types";

const PREFIX = "ws/w1/agent-1";
const workspaceRel = "workspaces/W/A";
const boardRel = `${workspaceRel}/.houston/activity/activity.json`;
const titled = { id: "mine", title: "Plan the offsite", status: "running" };

afterEach(() => vi.restoreAllMocks());

async function seed(root: string, rel: string, content: string) {
  const path = join(root, ...rel.split("/"));
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}

/**
 * The store as a burst of new missions on one agent sees it: before each of
 * this turn's first `races` board uploads, the gateway lands a sibling
 * mission's card, so the upload misses its generation.
 */
function burstStore(storeRoot: string, races: number): ObjectStore {
  const inner = new LocalDirStore(storeRoot);
  const boardKey = `${PREFIX}/${boardRel}`;
  const boardPath = join(storeRoot, ...boardKey.split("/"));
  let generation = 1;
  let raced = 0;
  return {
    list: (prefix) => inner.list(prefix),
    manifest: (prefix) => inner.manifest(prefix),
    download: (key, dest) => inner.download(key, dest),
    downloadVersioned: async (key, dest) => {
      await inner.download(key, dest);
      return { generation: String(generation) };
    },
    upload: async (source, key, options) => {
      if (key === boardKey && raced < races) {
        raced += 1;
        const cards = JSON.parse(
          await readFile(boardPath, "utf8").catch(() => "[]"),
        ) as unknown[];
        const sibling = { id: `sibling-${raced}`, title: "New mission" };
        await seed(storeRoot, boardKey, JSON.stringify([...cards, sibling]));
        generation += 1;
        throw new StoreConflictError(key, `412 at ${generation}`);
      }
      await inner.upload(source, key, options);
      if (key === boardKey) generation += 1;
      return { generation: String(generation) };
    },
    delete: (key, options) => inner.delete(key, options),
  };
}

/** A claimed new-mission turn whose tree holds the titled card, then durability. */
async function titledTurn(races: number) {
  // Delays at half their ceiling: the rounds still wait, the suite stays fast.
  vi.spyOn(Math, "random").mockReturnValue(0);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const storeRoot = await mkdtemp(join(tmpdir(), "title-sync-"));
  await seed(join(storeRoot, PREFIX), `${workspaceRel}/CLAUDE.md`, "# A\n");
  const store = burstStore(storeRoot, races);
  const filesystem = await prepareTurnFilesystem({
    store,
    prefix: PREFIX,
    root: await mkdtemp(join(tmpdir(), "title-sync-root-")),
    claimed: true,
  });
  await seed(
    filesystem.workspaceDir,
    ".houston/activity/activity.json",
    JSON.stringify([titled]),
  );
  const deps = {
    poolStoreUrl: "https://store.example",
    fetchImpl: (async (_url: unknown, init?: RequestInit) =>
      init?.method === "PUT"
        ? new Response("{}", { status: 200 })
        : Response.json({ doc: [], revision: 1 })) as typeof fetch,
    activityDocRetryDelaysMs: [],
  } as unknown as TurnServerDeps;
  const turn = {
    shadow: false,
    claim: { id: "c", token: "t", bootId: "b", heartbeatUrl: "https://x" },
    hostToken: "host-token",
    gcsPrefix: PREFIX,
    conversationId: "activity-mine",
    turnId: "turn-1",
  } as unknown as TurnRequest & { turnId: string };
  const durable = await finishTurnDurability({
    deps,
    turn,
    filesystem,
    resolved: { store, prefix: PREFIX },
    heartbeat: null,
    outcome: {},
    transcript: null,
  });
  const frame = durableTerminalFrame(
    durable,
    "turn-1",
    {},
    {
      hydratedObjects: 1,
      skippedObjects: 0,
      startupObjects: 1,
      startupBytes: 0,
    },
    landedMissionTitle(
      {
        outcome: "written",
        ms: 40,
        written: {
          conversationId: "activity-mine",
          title: titled.title,
          fallback: "New mission",
        },
      },
      durable.sync,
    ),
  ) as unknown as { type: string; data: Record<string, unknown> };
  const stored = JSON.parse(
    await readFile(join(storeRoot, PREFIX, ...boardRel.split("/")), "utf8"),
  ) as { id: string; title: string }[];
  return { frame, stored };
}

test("a title that loses the board race to a burst still lands, and the frame says how", async () => {
  const { frame, stored } = await titledTurn(3);

  expect(frame.type).toBe("done");
  expect(frame.data.missionTitle).toEqual({
    outcome: "written",
    ms: 40,
    mergeAttempts: 3,
  });
  expect(frame.data.changed).toContain("ActivityChanged");
  expect(frame.data.syncMerges).toEqual([{ key: boardRel, attempts: 3 }]);
  expect(frame.data.syncIncomplete).toBeUndefined();
  expect(stored.map((card) => card.id).sort()).toEqual([
    "mine",
    "sibling-1",
    "sibling-2",
    "sibling-3",
  ]);
  expect(stored.find((card) => card.id === "mine")?.title).toBe(titled.title);
});

test("a board that never lands reports the title as sync_lost with the key", async () => {
  const { frame, stored } = await titledTurn(7);

  expect(frame.data.missionTitle).toEqual({
    outcome: "sync_lost",
    ms: 40,
    mergeAttempts: 6,
  });
  expect(frame.data.changed ?? []).not.toContain("ActivityChanged");
  expect(frame.data.syncIncomplete).toEqual({
    conflicts: [boardRel],
    skipped: [],
  });
  expect(stored.some((card) => card.id === "mine")).toBe(false);
});
