import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { unconnectedRoutineTurn } from "./turn-routine-unconnected";

let dataDir: string;
beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "routine-unconnected-"));
});
afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

const saved = (activeProvider: string) =>
  writeFile(join(dataDir, "settings.json"), JSON.stringify({ activeProvider }));
const credential = { provider: "anthropic", kind: "api_key" } as never;

test("a turn with a credential reached a provider: nothing to type", async () => {
  await saved("openai");
  expect(unconnectedRoutineTurn({ credential }, "anthropic", dataDir)).toBe(
    undefined,
  );
});

test("the turn's own provider (the routine's pin) wins over the saved one", async () => {
  await saved("openai");
  expect(
    unconnectedRoutineTurn({ credential: null }, "anthropic", dataDir),
  ).toEqual({
    provider: "anthropic",
  });
});

test("an unpinned turn blames the agent's saved provider", async () => {
  await saved("openai");
  expect(
    unconnectedRoutineTurn({ credential: null }, undefined, dataDir),
  ).toEqual({
    provider: "openai",
  });
});

test("nothing pinned and nothing saved names no provider", async () => {
  expect(
    unconnectedRoutineTurn({ credential: null }, undefined, dataDir),
  ).toEqual({});
  await writeFile(join(dataDir, "settings.json"), "{not json");
  expect(unconnectedRoutineTurn({ credential: null }, "", dataDir)).toEqual({});
});
