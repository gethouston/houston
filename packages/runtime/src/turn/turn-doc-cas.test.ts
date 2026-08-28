import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  fileSha256,
  type ObjectMetadata,
  ObjectNotFoundError,
  type ObjectStore,
  StoreConflictError,
  syncBack,
} from "@houston/runtime-client/object-sync";
import { expect, test } from "vitest";
import { mutateTurnDocument, TurnDocConflictError } from "./turn-doc-cas";
import type { TurnFilesystem } from "./turn-filesystem";

async function fixture(conflicts: number) {
  const root = await mkdtemp(join(tmpdir(), "turn-cas-"));
  const relativePath = "workspaces/Personal/Bob/doc.json";
  const local = join(root, ...relativePath.split("/"));
  let remote = JSON.stringify({ values: ["remote"] });
  let generation = 1;
  let uploads = 0;
  const store: ObjectStore = {
    list: async () => [relativePath],
    manifest: async (): Promise<ObjectMetadata[]> => [
      {
        key: relativePath,
        size: remote.length,
        md5: "",
        updated: "2026-01-01T00:00:00.000Z",
        generation: String(generation),
      },
    ],
    download: async (_key, dest) => {
      await mkdir(dirname(dest), { recursive: true });
      await writeFile(dest, remote);
    },
    upload: async (src, key, options) => {
      uploads += 1;
      if (uploads <= conflicts) {
        remote = JSON.stringify({ values: ["concurrent"] });
        generation += 1;
        throw new StoreConflictError(key, "stale");
      }
      expect(options?.ifGenerationMatch).toBe(String(generation));
      remote = await readFile(src, "utf8");
      generation += 1;
      return { generation: String(generation) };
    },
    delete: async () => undefined,
  };
  const filesystem = {
    storeRoot: root,
    manifest: new Map(),
    immediateWrites: new Set<string>(),
  } as TurnFilesystem;
  return {
    store,
    prefix: "",
    filesystem,
    relativePath,
    local,
    getRemote: () => remote,
  };
}

test("a generation conflict re-reads and re-applies the mutation", async () => {
  const state = await fixture(1);
  await mutateTurnDocument({
    ...state,
    apply: async () => {
      const doc = JSON.parse(await readFile(state.local, "utf8")) as {
        values: string[];
      };
      await writeFile(
        state.local,
        JSON.stringify({ values: [...doc.values, "ours"] }),
      );
    },
  });

  expect(JSON.parse(state.getRemote())).toEqual({
    values: ["concurrent", "ours"],
  });
  expect(state.filesystem.manifest.get(state.relativePath)?.generation).toBe(
    "3",
  );
  expect(state.filesystem.immediateWrites).toContain(state.relativePath);
});

test("three generation conflicts become a typed conflict", async () => {
  const state = await fixture(3);
  await expect(
    mutateTurnDocument({
      ...state,
      apply: async () => undefined,
    }),
  ).rejects.toBeInstanceOf(TurnDocConflictError);
});

test("a terminal conflict restores the pre-call file before final sync", async () => {
  const state = await fixture(3);
  const before = "pre-call bytes";
  await mkdir(dirname(state.local), { recursive: true });
  await writeFile(state.local, before);
  state.filesystem.manifest.set(state.relativePath, {
    hash: await fileSha256(state.local, before.length),
    generation: "1",
  });

  await expect(
    mutateTurnDocument({
      ...state,
      apply: async () => writeFile(state.local, "failed mutation"),
    }),
  ).rejects.toBeInstanceOf(TurnDocConflictError);

  expect(await readFile(state.local, "utf8")).toBe(before);
  const finalSync = await syncBack(
    state.store,
    state.prefix,
    state.filesystem.storeRoot,
    state.filesystem.manifest,
    { generations: true },
  );
  expect(finalSync.uploaded).toEqual([]);
  expect((await stat(state.local)).size).toBe(before.length);
});

test("an upload failure restores the pre-call file before final sync", async () => {
  const state = await fixture(0);
  const before = "pre-call bytes";
  await mkdir(dirname(state.local), { recursive: true });
  await writeFile(state.local, before);
  state.filesystem.manifest.set(state.relativePath, {
    hash: await fileSha256(state.local, before.length),
    generation: "1",
  });
  state.store.upload = async () => {
    throw new Error("store unavailable");
  };

  await expect(
    mutateTurnDocument({
      ...state,
      apply: async () => writeFile(state.local, "failed mutation"),
    }),
  ).rejects.toThrow("store unavailable");

  expect(await readFile(state.local, "utf8")).toBe(before);
  const finalSync = await syncBack(
    state.store,
    state.prefix,
    state.filesystem.storeRoot,
    state.filesystem.manifest,
    { generations: true },
  );
  expect(finalSync.uploaded).toEqual([]);
});

test("refresh merges same-turn local routines with remote before applying", async () => {
  const root = await mkdtemp(join(tmpdir(), "turn-cas-merge-"));
  const relativePath =
    "workspaces/Personal/Bob/.houston/routines/routines.json";
  const local = join(root, ...relativePath.split("/"));
  const handEdited = { id: "hand", name: "Hand edit" };
  const remoteOnly = { id: "remote", name: "Remote" };
  const saved = { id: "saved", name: "Saved" };
  await mkdir(dirname(local), { recursive: true });
  await writeFile(local, JSON.stringify([handEdited]));
  let remote = JSON.stringify([remoteOnly]);
  const store: ObjectStore = {
    list: async () => [relativePath],
    manifest: async () => {
      throw new Error("single-object reads must not list the manifest");
    },
    download: async () => {
      throw new Error("versioned download must be used");
    },
    downloadVersioned: async (_key, dest) => {
      await writeFile(dest, remote);
      return { generation: "2" };
    },
    upload: async (source) => {
      remote = await readFile(source, "utf8");
      return { generation: "3" };
    },
    delete: async () => undefined,
  };
  const filesystem = {
    storeRoot: root,
    manifest: new Map([
      [
        relativePath,
        {
          hash: await fileSha256(local, (await stat(local)).size),
          generation: "1",
        },
      ],
    ]),
    immediateWrites: new Set<string>(),
  } as TurnFilesystem;

  await mutateTurnDocument({
    store,
    prefix: "",
    filesystem,
    relativePath,
    apply: async () => {
      const routines = JSON.parse(await readFile(local, "utf8")) as unknown[];
      await writeFile(local, JSON.stringify([...routines, saved]));
    },
  });

  expect(JSON.parse(remote)).toEqual([remoteOnly, handEdited, saved]);
});

test("a store without refresh capability stops after its first conflict", async () => {
  const state = await fixture(0);
  delete state.store.manifest;
  let uploads = 0;
  state.store.upload = async (_source, key) => {
    uploads += 1;
    throw new StoreConflictError(key, "stale");
  };

  await expect(
    mutateTurnDocument({
      ...state,
      apply: async () => {
        await mkdir(dirname(state.local), { recursive: true });
        await writeFile(state.local, "mutation");
      },
    }),
  ).rejects.toBeInstanceOf(TurnDocConflictError);
  expect(uploads).toBe(1);
});

test("a vanished remote object cannot leave a sync-visible temp file", async () => {
  const state = await fixture(0);
  state.store.download = async (key, dest) => {
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, "partial");
    throw new ObjectNotFoundError(key, "vanished");
  };
  state.store.upload = async () => ({ generation: "2" });
  await mutateTurnDocument({
    ...state,
    apply: async () => writeFile(state.local, "mutation"),
  });

  expect(await readdir(dirname(state.local))).toEqual(["doc.json"]);
});

test("a declined mutation restores the pre-call state without uploading", async () => {
  const state = await fixture(0);
  const upload = state.store.upload;
  let uploads = 0;
  state.store.upload = async (...args) => {
    uploads += 1;
    return upload(...args);
  };
  const result = await mutateTurnDocument({
    ...state,
    apply: async () => ({ error: "invalid" }),
    shouldCommit: () => false,
  });
  expect(result).toEqual({ error: "invalid" });
  expect(uploads).toBe(0);
  expect(state.filesystem.manifest.has(state.relativePath)).toBe(false);
  await expect(readFile(state.local, "utf8")).rejects.toMatchObject({
    code: "ENOENT",
  });
});
