import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  type ObjectMetadata,
  type ObjectStore,
  StoreConflictError,
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

test("a declined mutation refreshes ownership without uploading", async () => {
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
  expect(state.filesystem.manifest.get(state.relativePath)?.generation).toBe(
    "1",
  );
});
