import { createHash } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  type HydrateManifest,
  ObjectNotFoundError,
  type ObjectStore,
  trustedBase,
} from "@houston/runtime-client/object-sync";
import { expect, test } from "vitest";
import { remoteActivityReader } from "./turn-mission-title-remote";

const workspaceRel = "workspaces/Houston/Agent";
const BOARD = `${workspaceRel}/.houston/activity/activity.json`;
const sha256 = (body: string) =>
  createHash("sha256").update(body).digest("hex");
const card = (id: string, status = "running") => ({
  id,
  title: id,
  description: "",
  status,
});

function storeServing(body: string, generation?: string) {
  const keys: string[] = [];
  const download = async (key: string, dest: string) => {
    keys.push(key);
    await writeFile(dest, body);
  };
  const store = {
    list: async () => [],
    upload: async () => undefined,
    delete: async () => undefined,
    download,
    ...(generation
      ? {
          downloadVersioned: async (key: string, dest: string) => {
            await download(key, dest);
            return { generation };
          },
        }
      : {}),
  } as ObjectStore;
  return { store, keys };
}

async function tree(opts: {
  hydrated?: unknown[];
  local?: unknown[];
  generationAware?: boolean;
}) {
  const storeRoot = await mkdtemp(join(tmpdir(), "title-remote-"));
  const manifest: HydrateManifest = new Map();
  if (opts.hydrated) {
    const raw = JSON.stringify(opts.hydrated);
    manifest.set(BOARD, { hash: sha256(raw), generation: "3", mergeBase: raw });
  }
  if (opts.local) {
    const path = join(storeRoot, ...BOARD.split("/"));
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(opts.local));
  }
  const generationAware = opts.generationAware ?? true;
  return { storeRoot, workspaceRel, manifest, generationAware };
}

test("the remote reader reads the store key sync-back writes", async () => {
  const { store, keys } = storeServing(JSON.stringify([card("m1")]));
  const read = remoteActivityReader(store, "", await tree({}));
  expect((await read())?.items.map((a) => a.id)).toEqual(["m1"]);
  expect(keys).toEqual([BOARD]);
  const missing = remoteActivityReader(
    {
      ...store,
      download: async (key: string) => {
        throw new ObjectNotFoundError(key, "gone");
      },
    },
    "",
    await tree({}),
  );
  expect(await missing()).toBeNull();
});

test("the stored board carries the turn's own edits, merged three-way", async () => {
  const hydrated = [card("edited"), card("dropped")];
  const stored = [...hydrated, card("mine")];
  const { store } = storeServing(JSON.stringify(stored), "9");
  const read = remoteActivityReader(
    store,
    "ws/o/a",
    await tree({ hydrated, local: [card("edited", "done"), card("made")] }),
  );
  const items = (await read())?.items ?? [];
  expect(items.map((a) => [a.id, a.status])).toEqual([
    ["edited", "done"],
    ["mine", "running"],
    ["made", "running"],
  ]);
});

test("adopt re-bases the board on the read's bytes and generation", async () => {
  const raw = JSON.stringify([card("mine")]);
  const turnTree = await tree({ hydrated: [] });
  const board = await remoteActivityReader(
    storeServing(raw, "9").store,
    "",
    turnTree,
  )();
  board?.adopt();
  const entry = turnTree.manifest.get(BOARD);
  expect(entry).toEqual({ hash: sha256(raw), generation: "9", mergeBase: raw });
  expect(trustedBase(entry)).toBe(raw);
});

test("an unversioned read keeps the hydrated guard, or none on a guarded store", async () => {
  const raw = JSON.stringify([card("mine")]);
  const { store } = storeServing(raw);
  const hydrated = await tree({ hydrated: [] });
  (await remoteActivityReader(store, "", hydrated)())?.adopt();
  expect(hydrated.manifest.get(BOARD)).toMatchObject({
    generation: "3",
    mergeBase: raw,
  });
  const cold = await tree({});
  (await remoteActivityReader(store, "", cold)())?.adopt();
  expect(cold.manifest.has(BOARD)).toBe(false);
  const plain = await tree({ generationAware: false });
  (await remoteActivityReader(store, "", plain)())?.adopt();
  expect(plain.manifest.get(BOARD)).toEqual({
    hash: sha256(raw),
    mergeBase: raw,
  });
});
