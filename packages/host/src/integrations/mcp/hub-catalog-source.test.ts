import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import SNAPSHOT from "./hub-catalog.json";
import { HubCatalogSource } from "./hub-catalog-source";

const dir = () => mkdtempSync(join(tmpdir(), "hub-catalog-"));
const fresh = [{ slug: "newapp", name: "New App" }];
const ok = (body: unknown) =>
  (async () =>
    new Response(JSON.stringify(body), {
      status: 200,
    })) as unknown as typeof fetch;

test("no cache: serves the baked snapshot instantly, refreshes in background", async () => {
  const source = new HubCatalogSource({
    cachePath: join(dir(), "cache.json"),
    fetchFn: ok(fresh),
  });
  // First resolve answers from the snapshot (never blocks on the network)…
  expect((await source.resolve()).length).toBe(SNAPSHOT.length);
  // …and once the (test-awaited) refresh lands, the fetched list serves.
  await source.refresh();
  expect(await source.resolve()).toEqual(fresh);
});

test("a fresh disk cache serves without fetching at all", async () => {
  const path = join(dir(), "cache.json");
  writeFileSync(path, JSON.stringify({ fetchedAtMs: 1_000, toolkits: fresh }));
  let fetched = 0;
  const source = new HubCatalogSource({
    cachePath: path,
    nowMs: () => 2_000, // well inside the TTL
    fetchFn: (async () => {
      fetched++;
      return new Response("[]", { status: 200 });
    }) as unknown as typeof fetch,
  });
  expect(await source.resolve()).toEqual(fresh);
  expect(fetched).toBe(0);
});

test("a failed or malformed refresh keeps the current list (never throws)", async () => {
  const source = new HubCatalogSource({
    cachePath: join(dir(), "cache.json"),
    fetchFn: ok({ not: "an array" }),
  });
  await source.refresh();
  expect((await source.resolve()).length).toBe(SNAPSHOT.length);

  const offline = new HubCatalogSource({
    cachePath: join(dir(), "cache.json"),
    fetchFn: (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch,
  });
  await offline.refresh();
  expect((await offline.resolve()).length).toBe(SNAPSHOT.length);
});

test('url "" disables fetching entirely (offline mode)', async () => {
  let fetched = 0;
  const source = new HubCatalogSource({
    cachePath: join(dir(), "cache.json"),
    url: "",
    fetchFn: (async () => {
      fetched++;
      return new Response("[]");
    }) as unknown as typeof fetch,
  });
  await source.resolve();
  await new Promise((r) => setTimeout(r, 10));
  expect(fetched).toBe(0);
});

test("a corrupt disk cache reads as absent (snapshot serves)", async () => {
  const path = join(dir(), "cache.json");
  writeFileSync(path, "{corrupt");
  const source = new HubCatalogSource({ cachePath: path, url: "" });
  expect((await source.resolve()).length).toBe(SNAPSHOT.length);
});
