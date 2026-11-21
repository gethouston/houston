import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  HydrateManifest,
  ObjectStore,
} from "@houston/runtime-client/object-sync";
import { expect, test } from "vitest";
import { fetchObject } from "./lazy-store-fetch";
import { LazyReadRefusedError } from "./lazy-store-types";

const STATE = "workspaces/P/Bob/.houston/browser/state.json";

test("a refused private directory is a typed refusal, never a measured file", async () => {
  const root = mkdtempSync(join(tmpdir(), "lazy-fetch-"));
  const dest = join(root, ...STATE.split("/"));
  mkdirSync(join(dest, ".."), { recursive: true });
  writeFileSync(dest, '{"cookies":["planted"]}');
  const store: ObjectStore = {
    list: async () => [],
    download: async () => ({ refused: true }),
    upload: async () => undefined,
    delete: async () => undefined,
  };
  const manifest: HydrateManifest = new Map();
  const budget = { materializedBytes: 0 };
  const read = fetchObject(
    {
      store,
      prefix: "p",
      root,
      manifest,
      maxObjectBytes: 1024,
      maxBytes: 4096,
    },
    budget,
    STATE,
    { key: STATE, size: 10, md5: "", updated: "" },
  );
  await expect(read).rejects.toBeInstanceOf(LazyReadRefusedError);
  await expect(read).rejects.toMatchObject({ reason: "private", key: STATE });
  expect(manifest.has(STATE)).toBe(false);
  expect(budget.materializedBytes).toBe(0);
});
