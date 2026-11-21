import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { hydrate } from "./hydrate";
import type { ObjectStore } from "./object-store";
import {
  PrefetchedObjectStore,
  parsePrefetchedObjects,
} from "./prefetched-store";

const meta = (key: string, size: number) => ({
  key,
  size,
  md5: "m",
  updated: "2026-09-24T00:00:00Z",
  gen: 5,
});

test("hydration reads inlined objects from memory and only misses from the store", async () => {
  const calls: string[] = [];
  const inner: ObjectStore = {
    list: async () => [],
    manifest: async () => {
      calls.push("manifest");
      return [];
    },
    download: async () => {
      throw new Error("unused");
    },
    downloadMany: async (entries) => {
      calls.push(`batch ${entries.map(({ key }) => key).join(",")}`);
      const { writeFileSync } = await import("node:fs");
      for (const entry of entries) writeFileSync(entry.destFile, "from-store");
      return new Map(
        entries.map(({ key }) => [key, { status: "ok" as const }]),
      );
    },
    upload: async () => undefined,
    delete: async () => undefined,
  };
  const prefetched = parsePrefetchedObjects({
    manifest: [meta("CLAUDE.md", 5), meta("notes.md", 10)],
    objects: {
      "CLAUDE.md": {
        data: Buffer.from("hello").toString("base64"),
        generation: "5",
      },
    },
  });
  if (!prefetched) throw new Error("prefetch did not parse");
  const store = new PrefetchedObjectStore(inner, prefetched);
  const dest = mkdtempSync(join(tmpdir(), "houston-prefetch-"));

  const manifest = await hydrate(store, "", dest);

  expect(readFileSync(join(dest, "CLAUDE.md"), "utf8")).toBe("hello");
  expect(readFileSync(join(dest, "notes.md"), "utf8")).toBe("from-store");
  expect(manifest.get("CLAUDE.md")?.generation).toBe("5");
  expect(calls).toEqual(["batch notes.md"]);
  await store.manifest();
  expect(calls).toEqual(["batch notes.md", "manifest"]);
});

test("the prefetched listing reads a prefix as a directory, like every store", async () => {
  const inner: ObjectStore = {
    list: async () => [],
    download: async () => undefined,
    upload: async () => undefined,
    delete: async () => undefined,
  };
  const prefetched = parsePrefetchedObjects({
    manifest: [meta("skills/a/SKILL.md", 1), meta("skills-old/a/SKILL.md", 1)],
  });
  if (!prefetched) throw new Error("prefetch did not parse");

  const listed = await new PrefetchedObjectStore(inner, prefetched).manifest(
    "skills",
  );

  expect(listed.map((object) => object.key)).toEqual(["skills/a/SKILL.md"]);
});

test("a malformed prefetch is dropped, never fatal", () => {
  expect(parsePrefetchedObjects({ manifest: "nope" })).toBeUndefined();
  expect(parsePrefetchedObjects(null)).toBeUndefined();
});
