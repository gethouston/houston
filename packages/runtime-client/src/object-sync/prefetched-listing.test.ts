import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { memoryStore } from "./memory-store.test-support";
import {
  PrefetchedObjectStore,
  parsePrefetchedObjects,
} from "./prefetched-store";

const object = (key: string) => ({
  key,
  size: 1,
  md5: "",
  updated: "2026-11-10T00:00:00.000Z",
  gen: "5",
});

test("the prefetched manifest answers the first manifest call only", async () => {
  const remote = memoryStore({ "live.txt": "x" });
  const parsed = parsePrefetchedObjects({
    manifest: [object("prefetched.txt")],
    objects: {},
  });
  if (!parsed) throw new Error("unparsed");
  const store = new PrefetchedObjectStore(remote.store, parsed);
  expect(store.servesListing).toBe(true);
  expect((await store.manifest()).map(({ key }) => key)).toEqual([
    "prefetched.txt",
  ]);
  expect(store.servesListing).toBe(false);
  expect((await store.manifest()).map(({ key }) => key)).toEqual(["live.txt"]);
});

test("inlined bytes never answer a read after the turn's first write", async () => {
  const remote = memoryStore({ "a.txt": "live", "b.txt": "x" });
  const store = new PrefetchedObjectStore(remote.store, {
    manifest: [],
    objects: new Map([
      ["a.txt", { data: Buffer.from("stale"), generation: "1" }],
    ]),
  });
  await store.delete("b.txt");
  const dest = join(await mkdtemp(join(tmpdir(), "prefetched-")), "a.txt");
  const read = await store.downloadVersioned("a.txt", dest);
  expect(await readFile(dest, "utf8")).toBe("live");
  expect(read.generation).toBe(remote.generation("a.txt"));
});
