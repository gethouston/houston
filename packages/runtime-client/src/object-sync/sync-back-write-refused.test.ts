import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect, test } from "vitest";
import { objectStoreResponseError } from "./http-store-errors";
import type { HydrateManifest } from "./hydrate";
import { memoryStore } from "./memory-store.test-support";
import { ObjectWriteRefusedError } from "./object-store";
import { syncBack } from "./sync-back";

const W = "workspaces/Personal/Bob";

async function tree(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "write-refused-"));
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(root, ...rel.split("/"));
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, body);
  }
  return root;
}

test("a refused write or delete is typed, a refused read is not", async () => {
  const refused = (method: string, key: string) =>
    objectStoreResponseError(
      new Response("key outside claim scope", { status: 403 }),
      method,
      key,
    );
  expect(await refused("PUT", "k")).toBeInstanceOf(ObjectWriteRefusedError);
  expect(await refused("POST", "k")).toBeInstanceOf(ObjectWriteRefusedError);
  expect(await refused("DELETE", "k")).toBeInstanceOf(ObjectWriteRefusedError);
  expect(await refused("GET", "k")).not.toBeInstanceOf(ObjectWriteRefusedError);
  expect(await refused("POST", "batch")).not.toBeInstanceOf(
    ObjectWriteRefusedError,
  );
});

test("one refused file is reported and the rest of the pass still lands", async () => {
  const mem = memoryStore({ [`${W}/gone.md`]: "old" });
  const upload = mem.store.upload;
  const remove = mem.store.delete;
  mem.store.upload = async (source, key, opts) => {
    if (key === `${W}/.houston/state.json`)
      throw new ObjectWriteRefusedError(key, "key outside claim scope");
    return upload(source, key, opts);
  };
  mem.store.delete = async (key, opts) => {
    if (key === `${W}/gone.md`)
      throw new ObjectWriteRefusedError(key, "key outside claim scope");
    return remove(key, opts);
  };
  const root = await tree({
    [`${W}/.houston/state.json`]: "{}",
    [`${W}/notes.md`]: "hello",
  });
  const manifest: HydrateManifest = new Map([
    [`${W}/gone.md`, { hash: "h", generation: mem.generation(`${W}/gone.md`) }],
  ]);
  const result = await syncBack(mem.store, "", root, manifest, {
    generations: true,
    workerMerge: true,
  });

  expect(result.uploaded).toEqual([`${W}/notes.md`]);
  expect(result.skipped).toEqual([
    {
      key: `${W}/.houston/state.json`,
      reason: "key outside claim scope",
      refused: true,
    },
  ]);
  expect(result.deletesKept).toEqual([
    { key: `${W}/gone.md`, reason: "key outside claim scope" },
  ]);
  expect(mem.body(`${W}/gone.md`)).toBe("old");
});
