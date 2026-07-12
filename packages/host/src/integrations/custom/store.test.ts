import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { FileCustomIntegrationStore } from "./store";
import type { CustomIntegrationDef } from "./types";

/**
 * FileCustomIntegrationStore persists user-created definitions to disk. The
 * load-bearing property under test: a missing file reads as empty (first
 * run), but a CORRUPT file THROWS rather than silently reading as empty — a
 * parse failure that read as "no integrations" would make every custom
 * integration vanish from the UI without a trace.
 */

let dir: string;
let path: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "houston-custom-store-"));
  path = join(dir, "custom-integrations.json");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const openapiDef = (slug: string, name: string): CustomIntegrationDef => ({
  kind: "openapi",
  slug,
  name,
  spec: { kind: "url", url: `https://${slug}.example.com/openapi.json` },
  auth: "none",
  addedAtMs: 1,
});

test("list() on a missing file returns empty, no file created yet", async () => {
  const store = new FileCustomIntegrationStore(path);
  expect(await store.list()).toEqual([]);
  expect(existsSync(path)).toBe(false);
});

test("put/list/remove roundtrip", async () => {
  const store = new FileCustomIntegrationStore(path);
  await store.put(openapiDef("acme", "Acme"));
  expect(await store.list()).toEqual([openapiDef("acme", "Acme")]);

  await store.remove("acme");
  expect(await store.list()).toEqual([]);

  // Removing an absent slug is a no-op, not an error.
  await store.remove("never-existed");
  expect(await store.list()).toEqual([]);
});

test("put with an existing slug REPLACES that definition, not appends", async () => {
  const store = new FileCustomIntegrationStore(path);
  await store.put(openapiDef("acme", "Acme v1"));
  await store.put(openapiDef("acme", "Acme v2"));
  const items = await store.list();
  expect(items).toHaveLength(1);
  expect(items[0]?.name).toBe("Acme v2");
});

test("a corrupt (unparsable) file throws instead of reading as empty", async () => {
  writeFileSync(path, "{not json", "utf8");
  const store = new FileCustomIntegrationStore(path);
  await expect(store.list()).rejects.toThrow();
});

test("a well-formed JSON file with the wrong shape throws, not silently empties", async () => {
  writeFileSync(path, JSON.stringify({ version: 2, items: [] }), "utf8");
  const store = new FileCustomIntegrationStore(path);
  await expect(store.list()).rejects.toThrow(
    /unrecognized definitions file shape/,
  );

  writeFileSync(path, JSON.stringify({ version: 1, items: "nope" }), "utf8");
  await expect(store.list()).rejects.toThrow(
    /unrecognized definitions file shape/,
  );
});

test("writes are atomic: the .tmp file never lingers after put()/remove()", async () => {
  const store = new FileCustomIntegrationStore(path);
  await store.put(openapiDef("acme", "Acme"));
  expect(existsSync(`${path}.tmp`)).toBe(false);
  // The final file is valid, complete JSON — never a half-written tmp artifact.
  expect(() => JSON.parse(readFileSync(path, "utf8"))).not.toThrow();

  await store.remove("acme");
  expect(existsSync(`${path}.tmp`)).toBe(false);
});
