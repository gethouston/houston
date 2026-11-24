import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { FsVfs } from "@houston/host/src/vfs";
import {
  ObjectNotFoundError,
  type ObjectStore,
  ObjectTooLargeError,
  StoreConflictError,
  StoreFencedError,
} from "@houston/runtime-client/object-sync";
import { afterEach, beforeEach, expect, test } from "vitest";
import { checkpointScope, startTurnCheckpoints } from "./turn-checkpoint";
import { syncTurnFilesystem, type TurnFilesystem } from "./turn-filesystem";

const WS = "workspaces/Personal/Bob";
const DATA = `${WS}/.houston/runtime`;

let root: string;
let objects: Map<string, { body: string; generation: number }>;
let landedCalls: { landed: readonly string[]; deleted?: readonly string[] }[];
let fenceUploads: boolean;
let tooLarge: Set<string>;
let onUpload: (key: string) => void;
beforeEach(async () => {
  tooLarge = new Set();
  onUpload = () => undefined;
  root = await mkdtemp(join(tmpdir(), "turn-checkpoint-"));
  objects = new Map();
  landedCalls = [];
  fenceUploads = false;
});
afterEach(async () => rm(root, { recursive: true, force: true }));

const store = {
  list: async () => [...objects.keys()],
  download: async (key: string, dest: string) => {
    const object = objects.get(key);
    if (!object) throw new ObjectNotFoundError(key, "404");
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, object.body);
  },
  upload: async (
    source: string,
    key: string,
    options?: { ifGenerationMatch?: string },
  ) => {
    if (fenceUploads) throw new StoreFencedError(key, "409");
    if (tooLarge.has(key)) throw new ObjectTooLargeError(key, "too large");
    onUpload(key);
    const generation = objects.get(key)?.generation ?? 0;
    if (
      options?.ifGenerationMatch !== undefined &&
      options.ifGenerationMatch !== String(generation)
    )
      throw new StoreConflictError(key, `412 at ${generation}`);
    objects.set(key, {
      body: await readFile(source, "utf8"),
      generation: generation + 1,
    });
    return { generation: String(generation + 1) };
  },
  delete: async (key: string) => {
    objects.delete(key);
  },
} as unknown as ObjectStore;

function filesystemWith(workspaceReady?: Promise<void>): TurnFilesystem {
  return {
    storeRoot: root,
    workspaceRel: WS,
    workspaceDir: join(root, WS),
    dataRel: DATA,
    vfs: new FsVfs(root),
    manifest: new Map(),
    generationAware: true,
    immediateWrites: new Set<string>(),
    ...(workspaceReady ? { workspaceReady } : {}),
  } as unknown as TurnFilesystem;
}

async function put(rel: string, body: string) {
  await mkdir(dirname(join(root, rel)), { recursive: true });
  await writeFile(join(root, rel), body);
}

function start(filesystem: TurnFilesystem, fenced = { fenced: false }) {
  return startTurnCheckpoints({
    store,
    prefix: "",
    filesystem,
    conversationId: "c1",
    heartbeat: fenced,
    landed: {
      add: (landed, deleted) =>
        landedCalls.push(deleted ? { landed, deleted } : { landed }),
    },
    intervalMs: 20,
  });
}

const until = async (check: () => boolean) => {
  for (let i = 0; i < 200 && !check(); i++)
    await new Promise((resolve) => setTimeout(resolve, 10));
};

const toolEnd = { type: "tool_end", data: { name: "Write", isError: false } };
const toolStart = { type: "tool_start", data: { name: "Bash", args: {} } };

test("a workspace file written by a tool lands before the turn ends", async () => {
  const filesystem = filesystemWith();
  const checkpoints = start(filesystem);
  await put(`${WS}/report.md`, "draft");
  await put(`${DATA}/conversations/c1.json`, "{}");
  await put(`${WS}/.houston/state/watermark.json`, "{}");
  checkpoints.observe(toolStart as never);
  checkpoints.observe(toolEnd as never);
  await until(() => landedCalls.length > 0);
  await checkpoints.stop();

  expect([...objects.keys()]).toEqual([`${WS}/report.md`]);
  expect(landedCalls).toEqual([{ landed: [`${WS}/report.md`] }]);
  expect(filesystem.manifest.get(`${WS}/report.md`)?.generation).toBe("1");
  expect(filesystem.immediateWrites.has(`${WS}/report.md`)).toBe(true);

  await put(`${WS}/report.md`, "final");
  const final = await syncTurnFilesystem({
    store,
    prefix: "",
    filesystem,
    conversationId: "c1",
    claimed: true,
  });
  expect(final.conflicts).toEqual([]);
  expect(final.uploaded).toContain(`${WS}/report.md`);
  expect(objects.get(`${WS}/report.md`)).toEqual({
    body: "final",
    generation: 2,
  });
});

test("no checkpoint runs while a tool is still running", async () => {
  const filesystem = filesystemWith();
  const checkpoints = start(filesystem);
  checkpoints.observe(toolStart as never);
  checkpoints.observe(toolEnd as never);
  checkpoints.observe(toolStart as never);
  await put(`${WS}/report.md`, "draft");
  await new Promise((resolve) => setTimeout(resolve, 120));
  await checkpoints.stop();
  expect(objects.size).toBe(0);
});

test("no checkpoint runs before the agent's own files finished loading", async () => {
  const filesystem = filesystemWith(new Promise(() => undefined));
  const checkpoints = start(filesystem);
  await put(`${WS}/report.md`, "draft");
  checkpoints.observe(toolEnd as never);
  await new Promise((resolve) => setTimeout(resolve, 120));
  await checkpoints.stop();
  expect(objects.size).toBe(0);
});

test("a manifest entry a concurrent write replaced survives the checkpoint", async () => {
  const filesystem = filesystemWith();
  const checkpoints = start(filesystem);
  await put(`${WS}/a.md`, "a");
  const replaced = { hash: "other", generation: "9" };
  const upload = store.upload.bind(store);
  store.upload = (async (...args: Parameters<ObjectStore["upload"]>) => {
    filesystem.manifest.set(`${WS}/b.md`, replaced);
    return upload(...args);
  }) as ObjectStore["upload"];
  checkpoints.observe(toolEnd as never);
  await until(() => landedCalls.length > 0);
  await checkpoints.stop();
  store.upload = upload;
  expect(filesystem.manifest.get(`${WS}/b.md`)).toBe(replaced);
  expect(filesystem.manifest.get(`${WS}/a.md`)?.generation).toBe("1");
});

test("a fenced claim stops checkpointing", async () => {
  const filesystem = filesystemWith();
  const fenced = { fenced: false };
  const checkpoints = start(filesystem, fenced);
  await put(`${WS}/a.md`, "a");
  fenceUploads = true;
  checkpoints.observe(toolEnd as never);
  await new Promise((resolve) => setTimeout(resolve, 120));
  fenceUploads = false;
  await put(`${WS}/b.md`, "b");
  checkpoints.observe(toolEnd as never);
  await new Promise((resolve) => setTimeout(resolve, 120));
  await checkpoints.stop();
  expect(objects.size).toBe(0);
  expect(landedCalls).toEqual([]);
});

test("the checkpoint scope is the workspace, never its internal state", () => {
  const inScope = checkpointScope(WS);
  expect(inScope(`${WS}/files/a.pdf`)).toBe(true);
  expect(inScope(`${WS}/.agents/skills/x/SKILL.md`)).toBe(true);
  expect(inScope(`${WS}/.houston/activity/activity.json`)).toBe(false);
  expect(inScope("custom-integrations.json")).toBe(false);
  expect(inScope(`${DATA}/sessions/c1/harness.json`)).toBe(false);
});

test("a file a tool deleted mid-turn stays in the store until the final pass", async () => {
  const filesystem = filesystemWith();
  objects.set(`${WS}/old.md`, { body: "old", generation: 1 });
  filesystem.manifest.set(`${WS}/old.md`, { hash: "h", generation: "1" });
  await put(`${WS}/new.md`, "new");
  const checkpoints = start(filesystem);
  checkpoints.observe(toolEnd as never);
  await until(() => landedCalls.length > 0);
  await checkpoints.stop();
  expect(objects.has(`${WS}/old.md`)).toBe(true);
  expect(filesystem.manifest.get(`${WS}/old.md`)).toEqual({
    hash: "h",
    generation: "1",
  });
  expect(landedCalls).toEqual([{ landed: [`${WS}/new.md`] }]);
});

test("a tool that starts mid-checkpoint stops its remaining uploads", async () => {
  const filesystem = filesystemWith();
  await put(`${WS}/a.md`, "a");
  await put(`${WS}/b.md`, "b");
  const checkpoints = start(filesystem);
  onUpload = () => checkpoints.observe(toolStart as never);
  checkpoints.observe(toolEnd as never);
  await until(() => landedCalls.length > 0);
  await checkpoints.stop();
  expect(objects.size).toBe(1);
  const [uploaded] = [...objects.keys()];
  expect(filesystem.manifest.has(uploaded ?? "")).toBe(true);
  expect(filesystem.manifest.size).toBe(1);
});

test("a file a checkpoint could not store is still reported by the final pass", async () => {
  const filesystem = filesystemWith();
  tooLarge.add(`${WS}/huge.bin`);
  await put(`${WS}/huge.bin`, "x");
  await put(`${WS}/a.md`, "a");
  const checkpoints = start(filesystem);
  checkpoints.observe(toolEnd as never);
  await until(() => landedCalls.length > 0);
  await checkpoints.stop();
  expect(filesystem.manifest.has(`${WS}/huge.bin`)).toBe(false);
  const final = await syncTurnFilesystem({
    store,
    prefix: "",
    filesystem,
    conversationId: "c1",
    claimed: true,
  });
  expect(final.skipped.map(({ key }) => key)).toEqual([`${WS}/huge.bin`]);
});

test("a conflict copy a checkpoint made is still reported by the final pass", async () => {
  const filesystem = filesystemWith();
  const rel = `${WS}/report.md`;
  objects.set(rel, { body: "theirs", generation: 2 });
  filesystem.manifest.set(rel, { hash: "stale", generation: "1" });
  await put(rel, "mine");
  const checkpoints = start(filesystem);
  checkpoints.observe(toolEnd as never);
  await until(() => landedCalls.length > 0);
  await checkpoints.stop();
  const copy = [...objects.keys()].find((key) => key.includes("(conflict"));
  expect(copy).toBeDefined();
  const final = await syncTurnFilesystem({
    store,
    prefix: "",
    filesystem,
    conversationId: "c1",
    claimed: true,
  });
  expect(final.conflictCopies).toEqual([{ key: rel, copy }]);
  expect(objects.get(rel)?.body).toBe("theirs");
});
