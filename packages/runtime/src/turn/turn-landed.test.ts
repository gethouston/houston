import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { docKey } from "@houston/domain";
import { FsVfs } from "@houston/host/src/vfs";
import type { WireFrame } from "@houston/runtime-client";
import {
  ObjectNotFoundError,
  type ObjectStore,
} from "@houston/runtime-client/object-sync";
import { afterEach, beforeEach, expect, test } from "vitest";
import type { TurnServerDeps } from "./server-types";
import type { TurnFilesystem } from "./turn-filesystem";
import { createTurnLanded } from "./turn-landed";
import type { TurnRequest } from "./types";

const WS = "workspaces/Personal/Bob";
const ROUTINES = docKey(WS, "routines");

let root: string;
let objects: Map<string, string>;
let frames: WireFrame[];
let docStatus: number;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "turn-landed-"));
  objects = new Map();
  frames = [];
  docStatus = 200;
});
afterEach(async () => rm(root, { recursive: true, force: true }));

const store = {
  list: async () => [...objects.keys()],
  download: async (key: string, dest: string) => {
    const body = objects.get(key);
    if (body === undefined) throw new ObjectNotFoundError(key, "404");
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, body);
  },
  downloadVersioned: async (key: string, dest: string) => {
    const body = objects.get(key);
    if (body === undefined) throw new ObjectNotFoundError(key, "404");
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, body);
    return { generation: "1" };
  },
  upload: async () => ({ generation: "1" }),
  delete: async () => undefined,
} as unknown as ObjectStore;

const turn = {
  workspaceId: "w1",
  agentId: "bob",
  conversationId: "c1",
  gcsPrefix: "ws/w1/bob",
  hostToken: "host-token",
  claim: { id: "1", bootId: "boot", token: "2", heartbeatUrl: "https://hb" },
  text: "",
  credential: null,
  turnId: "t1",
} as unknown as TurnRequest & { turnId: string };

const deps = {
  poolStoreUrl: "https://store.example",
  fetchImpl: (async (_url: unknown, init?: RequestInit) => {
    if (!init?.method || init.method === "GET")
      return Response.json({ error: "document not found" }, { status: 404 });
    return docStatus === 200
      ? Response.json({ revision: 1 })
      : Response.json({ error: "down" }, { status: docStatus });
  }) as typeof fetch,
  activityDocRetryDelaysMs: [],
} as unknown as TurnServerDeps;

function landedFor() {
  const filesystem = {
    storeRoot: root,
    workspaceRel: WS,
    workspaceDir: join(root, WS),
    dataRel: `${WS}/.houston/runtime`,
    vfs: new FsVfs(root),
    manifest: new Map(),
    generationAware: true,
    immediateWrites: new Set<string>(),
  } as unknown as TurnFilesystem;
  return createTurnLanded({
    deps,
    turn,
    filesystem,
    source: { store, prefix: "" },
    emit: (frame) => frames.push(frame),
  });
}

test("a landed workspace file is announced while the turn runs", async () => {
  const landed = landedFor();
  landed.add([`${WS}/report.pdf`, `${WS}/CLAUDE.md`]);
  await landed.settled();
  expect(frames).toEqual([
    {
      type: "landed",
      data: { changed: ["ContextChanged", "FilesChanged"] },
      turnId: "t1",
    },
  ]);
});

test("families whose projection lands at the turn's end wait for its terminal", async () => {
  const landed = landedFor();
  landed.add([
    docKey(WS, "activity"),
    `${WS}/.houston/runtime/conversations/c1.json`,
    "custom-integrations.json",
  ]);
  await landed.settled();
  expect(frames).toEqual([]);
});

test("a routines write is announced once its doc lands", async () => {
  objects.set(ROUTINES, "[]");
  const landed = landedFor();
  landed.add([ROUTINES]);
  await landed.settled();
  expect(frames).toEqual([
    { type: "landed", data: { changed: ["RoutinesChanged"] }, turnId: "t1" },
  ]);
});

test("a routines write whose doc did not land is not announced", async () => {
  objects.set(ROUTINES, "[]");
  docStatus = 500;
  const landed = landedFor();
  landed.add([ROUTINES, `${WS}/notes.txt`]);
  await landed.settled();
  expect(frames).toEqual([
    { type: "landed", data: { changed: ["FilesChanged"] }, turnId: "t1" },
  ]);
});

test("nothing is announced after the turn closed its announcements", async () => {
  const landed = landedFor();
  await landed.close();
  landed.add([`${WS}/late.txt`]);
  await landed.settled();
  expect(frames).toEqual([]);
});
