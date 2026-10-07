import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { WireFrame } from "@houston/runtime-client";
import {
  LocalDirStore,
  type ObjectStore,
  StoreConflictError,
} from "@houston/runtime-client/object-sync";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { executeReadyTurn } from "./execute-ready-turn";
import type { TurnServerDeps } from "./server-types";
import { prepareTurnFilesystem } from "./turn-filesystem";
import { startTurnMissionTitle } from "./turn-mission-title";
import type { TurnRequest } from "./types";

const PREFIX = "ws/w1/agent-1";
const BOARD = "workspaces/W/A/.houston/activity/activity.json";
const BOARD_KEY = `${PREFIX}/${BOARD}`;
const FALLBACK = "Plan the team offsite...";
const TITLE = "Team offsite plan";

type Card = { id: string; title: string; status: string; updated_at: string };
const other: Card = {
  id: "other",
  title: "Older mission",
  status: "running",
  updated_at: "2026-09-28T09:00:00.000Z",
};
// Created by the gateway in-process AFTER the worker hydrated its snapshot.
const mine: Card = {
  id: "mine",
  title: FALLBACK,
  status: "running",
  updated_at: "2026-09-28T10:00:00.000Z",
};

beforeEach(() => {
  vi.spyOn(Math, "random").mockReturnValue(0);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** A generation-guarded store whose board the gateway writes in-process. */
function gatewayStore(root: string) {
  const inner = new LocalDirStore(root);
  const path = (key: string) => join(root, ...key.split("/"));
  const generations = new Map<string, number>();
  const generation = (key: string) => String(generations.get(key) ?? 1);
  const bump = (key: string) =>
    generations.set(key, (generations.get(key) ?? 1) + 1);
  const boardUploads: ("landed" | "412")[] = [];
  let afterRead: (() => Promise<void>) | undefined;
  let duringUpload: ((source: string) => Promise<void>) | undefined;
  const read = async (key: string) => {
    const hook = key === BOARD_KEY ? afterRead : undefined;
    afterRead = undefined;
    await hook?.();
  };
  const cards = async () =>
    JSON.parse(await readFile(path(BOARD_KEY), "utf8")) as Card[];
  const write = async (mutate: (cards: Card[]) => Card[]) => {
    await writeFile(path(BOARD_KEY), JSON.stringify(mutate(await cards())));
    bump(BOARD_KEY);
  };
  const store: ObjectStore = {
    list: (prefix) => inner.list(prefix),
    manifest: async (prefix) =>
      (await inner.manifest(prefix)).map((object) => ({
        ...object,
        generation: generation(object.key),
      })),
    download: async (key, dest) => {
      await inner.download(key, dest);
      await read(key);
    },
    downloadVersioned: async (key, dest) => {
      const at = generation(key);
      await inner.download(key, dest);
      await read(key);
      return { generation: at };
    },
    upload: async (source, key, options) => {
      const match = options?.ifGenerationMatch;
      const stale =
        match !== undefined &&
        (match === "0" ? existsSync(path(key)) : match !== generation(key));
      if (key === BOARD_KEY) boardUploads.push(stale ? "412" : "landed");
      if (stale) throw new StoreConflictError(key, `412 at ${key}`);
      const hook = key === BOARD_KEY ? duringUpload : undefined;
      if (hook) duringUpload = undefined;
      await hook?.(source);
      await inner.upload(source, key);
      bump(key);
      return { generation: generation(key) };
    },
    delete: (key) => inner.delete(key),
    // Batched like the worker's HTTP store (`batchReads`), so hydration takes
    // the path production does.
    downloadMany: async (entries) => {
      const outcomes = new Map<string, { status: "ok"; generation: string }>();
      for (const { key, destFile } of entries) {
        await inner.download(key, destFile);
        outcomes.set(key, { status: "ok", generation: generation(key) });
      }
      return outcomes;
    },
  };
  const armAfterNextBoardRead = (hook: () => Promise<void>) => {
    afterRead = hook;
  };
  /** The source file changing between sync-back's hash and its upload. */
  const armDuringNextBoardUpload = (
    hook: (source: string) => Promise<void>,
  ) => {
    duringUpload = hook;
  };
  return {
    store,
    write,
    cards,
    boardUploads,
    armAfterNextBoardRead,
    armDuringNextBoardUpload,
  };
}

async function seed(root: string, rel: string, content: string) {
  await mkdir(dirname(join(root, rel)), { recursive: true });
  await writeFile(join(root, rel), content);
}

/**
 * A claimed new-mission turn: hydrate a board WITHOUT the mission's card, let
 * the gateway create it, run the turn (its own board edit, then the title),
 * and make it durable. `afterTitleRead` is the gateway writing in between.
 */
async function titledTurn(opts: {
  afterTitleRead?: (gateway: ReturnType<typeof gatewayStore>) => Promise<void>;
  ownEdit?: (cards: Card[]) => Card[];
  duringBoardUpload?: (source: string) => Promise<void>;
}) {
  const storeRoot = await mkdtemp(join(tmpdir(), "title-rebase-"));
  await seed(storeRoot, `${PREFIX}/workspaces/W/A/CLAUDE.md`, "# A\n");
  await seed(storeRoot, BOARD_KEY, JSON.stringify([other]));
  const gateway = gatewayStore(storeRoot);
  const root = await mkdtemp(join(tmpdir(), "title-rebase-root-"));
  const filesystem = await prepareTurnFilesystem({
    store: gateway.store,
    prefix: PREFIX,
    root,
    claimed: true,
  });
  await gateway.write((cards) => [...cards, mine]);
  const { afterTitleRead } = opts;
  if (afterTitleRead)
    gateway.armAfterNextBoardRead(() => afterTitleRead(gateway));
  if (opts.duringBoardUpload)
    gateway.armDuringNextBoardUpload(opts.duringBoardUpload);
  const ownEdit = opts.ownEdit;
  const deps = {
    store: gateway.store,
    token: "",
    poolStoreUrl: "https://store.example",
    fetchImpl: (async (_url: unknown, init?: RequestInit) =>
      init?.method === "PUT"
        ? new Response("{}", { status: 200 })
        : Response.json({ doc: [], revision: 1 })) as typeof fetch,
    activityDocRetryDelaysMs: [],
    runTurn: async (directories, request) => {
      const local = join(directories.workspaceDir, ".houston/activity");
      if (ownEdit) {
        const cards = JSON.parse(
          await readFile(join(local, "activity.json"), "utf8"),
        ) as Card[];
        await writeFile(
          join(local, "activity.json"),
          JSON.stringify(ownEdit(cards)),
        );
      }
      const finish = startTurnMissionTitle({
        conversationId: request.conversationId,
        request: { fallback: FALLBACK, text: "Plan the team offsite" },
        run: async () => TITLE,
        workspaceDir: directories.workspaceDir,
        ...(request.readRemoteActivity
          ? { readRemote: request.readRemoteActivity }
          : {}),
      });
      return { missionTitle: await finish() };
    },
  } as TurnServerDeps;
  const frames: WireFrame[] = [];
  await executeReadyTurn({
    deps,
    turn: {
      workspaceId: "w1",
      agentId: "agent-1",
      conversationId: "activity-mine",
      text: "Plan the team offsite",
      gcsPrefix: PREFIX,
      shadow: false,
      credential: { provider: "openai-codex", access: "a", expires: 1 },
      claim: { id: "c", token: "t", bootId: "b", heartbeatUrl: "https://x" },
      hostToken: "host-token",
      missionTitle: { fallback: FALLBACK, text: "Plan the team offsite" },
    } as unknown as TurnRequest,
    turnId: "turn-1",
    root,
    authPath: join(root, "auth.json"),
    signal: new AbortController().signal,
    filesystem,
    resolved: { store: gateway.store, prefix: PREFIX },
    heartbeat: null,
    sandbox: null,
    timings: {},
    emit: (frame) => frames.push(frame),
    turnLog: null,
    transcript: null,
  });
  const frame = frames.at(-1) as unknown as {
    type: string;
    data: Record<string, unknown>;
  };
  const stored = await gateway.cards();
  const card = (id: string) => stored.find((c) => c.id === id);
  return { frame, stored, card, boardUploads: gateway.boardUploads };
}

const later = () => new Date(Date.now() + 60_000).toISOString();

test("a status PATCH landing after the title's read keeps both the title and the status", async () => {
  const { frame, card, boardUploads } = await titledTurn({
    afterTitleRead: (gateway) =>
      gateway.write((cards) =>
        cards.map((c) =>
          c.id === "mine" ? { ...c, status: "done", updated_at: later() } : c,
        ),
      ),
  });

  expect(card("mine")).toMatchObject({ title: TITLE, status: "done" });
  expect(boardUploads).toEqual(["412", "landed"]);
  expect(frame.type).toBe("done");
  expect(frame.data.missionTitle).toEqual({
    outcome: "written",
    ms: expect.any(Number),
    waitMs: expect.any(Number),
    mergeAttempts: 1,
  });
});

test("a worker clock behind the gateway's still lands the title in one upload", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
  const { frame, card, boardUploads } = await titledTurn({});

  expect(card("mine")).toMatchObject({ title: TITLE, status: "running" });
  expect(boardUploads).toEqual(["landed"]);
  expect(frame.data.syncMerges).toBeUndefined();
  expect(frame.data.missionTitle).toEqual({
    outcome: "written",
    ms: expect.any(Number),
    waitMs: expect.any(Number),
  });
});

test("a card deleted after the title's read stays deleted, and the frame says so", async () => {
  const { frame, stored } = await titledTurn({
    afterTitleRead: (gateway) =>
      gateway.write((cards) => cards.filter((c) => c.id !== "mine")),
  });

  expect(stored.map((c) => c.id)).toEqual(["other"]);
  expect(frame.data.missionTitle).toMatchObject({ outcome: "card_missing" });
});

test("a rename landing after the title's read wins, and the frame says renamed", async () => {
  const { frame, card } = await titledTurn({
    afterTitleRead: (gateway) =>
      gateway.write((cards) =>
        cards.map((c) =>
          c.id === "mine"
            ? { ...c, title: "My own name", updated_at: later() }
            : c,
        ),
      ),
  });

  expect(card("mine")?.title).toBe("My own name");
  expect(frame.data.missionTitle).toMatchObject({ outcome: "renamed" });
});

test("the turn's own board edits survive the title's adoption of the stored board", async () => {
  const made: Card = { ...other, id: "made", title: "Made by the turn" };
  const { card, boardUploads } = await titledTurn({
    ownEdit: (cards) => [
      ...cards.map((c) => (c.id === "other" ? { ...c, status: "done" } : c)),
      made,
    ],
  });

  expect(card("other")?.status).toBe("done");
  expect(card("made")?.title).toBe("Made by the turn");
  expect(card("mine")?.title).toBe(TITLE);
  expect(boardUploads).toEqual(["landed"]);
});

test("a board rewritten while it uploads cannot vouch for the title", async () => {
  const { frame, card } = await titledTurn({
    duringBoardUpload: async (source) => {
      const cards = JSON.parse(await readFile(source, "utf8")) as Card[];
      const changed = cards.map((c) =>
        c.id === "mine" ? { ...c, title: "Changed mid-upload" } : c,
      );
      await writeFile(source, JSON.stringify(changed));
    },
  });

  // Other bytes landed than the pass hashed, so it cannot read them back.
  expect(card("mine")?.title).toBe("Changed mid-upload");
  expect(frame.data.missionTitle).toEqual({
    outcome: "unverified",
    ms: expect.any(Number),
    waitMs: expect.any(Number),
  });
});
