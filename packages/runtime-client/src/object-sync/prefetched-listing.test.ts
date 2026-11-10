import { expect, test } from "vitest";
import { memoryStore } from "./memory-store.test-support";
import {
  CLAIMED_TURN_LISTING_SCOPE,
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

test("a scoped listing parses without a whole-store manifest", () => {
  const parsed = parsePrefetchedObjects({
    listing: {
      scope: CLAIMED_TURN_LISTING_SCOPE,
      agentRoot: "workspaces/W/A",
      objects: [object("workspaces/W/A/CLAUDE.md")],
    },
    objects: {},
  });
  expect(parsed?.manifest).toBeUndefined();
  expect(parsed?.listing).toEqual({
    scope: CLAIMED_TURN_LISTING_SCOPE,
    agentRoot: "workspaces/W/A",
    objects: [
      {
        key: "workspaces/W/A/CLAUDE.md",
        size: 1,
        md5: "",
        updated: "2026-11-10T00:00:00.000Z",
        generation: "5",
      },
    ],
  });
});

test("a prefetch with neither listing, or a malformed one, is dropped", () => {
  expect(parsePrefetchedObjects({ objects: {} })).toBeUndefined();
  expect(
    parsePrefetchedObjects({ listing: { scope: 1 }, objects: {} }),
  ).toBeUndefined();
});

test("a scoped listing is taken once and never answers a manifest call", async () => {
  const remote = memoryStore({ "workspaces/W/A/CLAUDE.md": "hi" });
  const parsed = parsePrefetchedObjects({
    listing: {
      scope: CLAIMED_TURN_LISTING_SCOPE,
      agentRoot: "workspaces/W/A",
      objects: [],
    },
    objects: {},
  });
  if (!parsed) throw new Error("unparsed");
  const store = new PrefetchedObjectStore(remote.store, parsed);
  expect(store.servesWholeListing).toBe(false);
  expect(store.takeScopedListing()?.agentRoot).toBe("workspaces/W/A");
  expect(store.takeScopedListing()).toBeUndefined();
  expect((await store.manifest("")).map(({ key }) => key)).toEqual([
    "workspaces/W/A/CLAUDE.md",
  ]);
  expect(await store.manifestDir?.("workspaces")).toEqual({
    objects: [],
    dirs: ["workspaces/W"],
  });
});

test("a whole-store manifest still answers the first manifest call only", async () => {
  const remote = memoryStore({ "live.txt": "x" });
  const parsed = parsePrefetchedObjects({
    manifest: [object("prefetched.txt")],
    objects: {},
  });
  if (!parsed) throw new Error("unparsed");
  const store = new PrefetchedObjectStore(remote.store, parsed);
  expect(store.servesWholeListing).toBe(true);
  expect((await store.manifest()).map(({ key }) => key)).toEqual([
    "prefetched.txt",
  ]);
  expect(store.servesWholeListing).toBe(false);
  expect((await store.manifest()).map(({ key }) => key)).toEqual(["live.txt"]);
});
