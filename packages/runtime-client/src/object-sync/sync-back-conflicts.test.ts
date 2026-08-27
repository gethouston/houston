import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect, test } from "vitest";
import { fileSha256 } from "./file-hash";
import type { ObjectMetadata } from "./object-manifest";
import { type ObjectStore, StoreConflictError } from "./object-store";
import { syncBack } from "./sync-back";

async function conflictingUpload(
  relativePath: string,
  localBody: string,
  remoteBody: string,
) {
  const root = await mkdtemp(join(tmpdir(), "sync-back-conflict-"));
  const local = join(root, ...relativePath.split("/"));
  await mkdir(dirname(local), { recursive: true });
  await writeFile(local, localBody);
  const preconditions: Array<string | undefined> = [];
  let uploadedBody = "";
  let downloads = 0;
  let uploads = 0;
  const store: ObjectStore = {
    list: async () => [relativePath],
    manifest: async (): Promise<ObjectMetadata[]> => [
      {
        key: relativePath,
        size: remoteBody.length,
        md5: "",
        updated: "2026-08-27T00:00:00.000Z",
        generation: "2",
      },
    ],
    download: async (_key, dest) => {
      downloads += 1;
      await writeFile(dest, remoteBody);
    },
    upload: async (source, key, options) => {
      uploads += 1;
      preconditions.push(options?.ifGenerationMatch);
      if (uploads === 1) throw new StoreConflictError(key, "stale");
      uploadedBody = await readFile(source, "utf8");
      return { generation: "3" };
    },
    delete: async () => undefined,
  };
  const result = await syncBack(
    store,
    "",
    root,
    new Map([[relativePath, { hash: "before", generation: "1" }]]),
    { generations: true },
  );
  return {
    downloads: () => downloads,
    local,
    preconditions,
    result,
    uploadedBody: () => uploadedBody,
  };
}

test("a routines conflict keeps remote routines the pod lacks", async () => {
  const relativePath = ".houston/routines/routines.json";
  const local = [{ id: "shared", name: "Local", prompt: "updated" }];
  const remote = [
    { id: "remote", name: "Remote", prompt: "remote" },
    { id: "shared", name: "Stale", prompt: "stale" },
  ];
  const state = await conflictingUpload(
    relativePath,
    JSON.stringify(local),
    JSON.stringify(remote),
  );

  expect(JSON.parse(state.uploadedBody())).toEqual([remote[0], ...local]);
  expect(JSON.parse(await readFile(state.local, "utf8"))).toEqual([
    remote[0],
    ...local,
  ]);
  expect(state.preconditions).toEqual(["1", "2"]);
  expect(state.result.uploaded).toEqual([relativePath]);
  const { size } = await stat(state.local);
  expect(state.result.manifest.get(relativePath)?.hash).toBe(
    await fileSha256(state.local, size),
  );
});

test("a learnings conflict keeps remote learnings the pod lacks", async () => {
  const relativePath =
    "workspaces/Personal/Bob/.houston/learnings/learnings.json";
  const local = [{ id: "shared", text: "Local" }];
  const remote = [
    { id: "remote", text: "Remote" },
    { id: "shared", text: "Stale" },
  ];
  const state = await conflictingUpload(
    relativePath,
    JSON.stringify(local),
    JSON.stringify(remote),
  );

  expect(JSON.parse(state.uploadedBody())).toEqual([remote[0], ...local]);
  expect(JSON.parse(await readFile(state.local, "utf8"))).toEqual([
    remote[0],
    ...local,
  ]);
});

test("a custom definitions conflict keeps remote slugs the pod lacks", async () => {
  const relativePath = "custom-integrations.json";
  const local = { version: 1, items: [{ slug: "shared", name: "Local" }] };
  const remote = {
    version: 1,
    items: [
      { slug: "remote", name: "Remote" },
      { slug: "shared", name: "Stale" },
    ],
  };
  const state = await conflictingUpload(
    relativePath,
    JSON.stringify(local),
    JSON.stringify(remote),
  );
  const expected = { version: 1, items: [remote.items[0], ...local.items] };

  expect(JSON.parse(state.uploadedBody())).toEqual(expected);
  expect(JSON.parse(await readFile(state.local, "utf8"))).toEqual(expected);
});

test("an ordinary file conflict keeps local last-writer-wins behavior", async () => {
  const state = await conflictingUpload(
    "workspaces/Personal/Bob/notes.txt",
    "pod edit",
    "remote edit",
  );

  expect(state.uploadedBody()).toBe("pod edit");
  expect(await readFile(state.local, "utf8")).toBe("pod edit");
  expect(state.downloads()).toBe(0);
  expect(state.preconditions).toEqual(["1", "2"]);
});
