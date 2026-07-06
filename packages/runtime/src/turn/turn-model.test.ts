import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { OPENAI_COMPATIBLE } from "../ai/openai-compatible";
import { resolveTurnModel } from "./turn-model";

/**
 * The per-turn cloud runtime resolves each turn's model against the THROWAWAY
 * hydrated data dir (turn-session.ts materializes the agent's object-storage
 * prefix into its own root per request), never `config.dataDir`. For the
 * OpenAI-compatible (custom endpoint) provider the model is hand-built from the
 * hydrated `custom-endpoint.json`, so resolution must read THAT dir.
 */

function tmpDataDir(): string {
  return mkdtempSync(join(tmpdir(), "houston-turn-model-"));
}

function writeEndpoint(dataDir: string, e: Record<string, unknown>): void {
  writeFileSync(join(dataDir, "custom-endpoint.json"), JSON.stringify(e));
}

type ResolvedModel = { id?: string; baseUrl?: string; provider?: string };

test("resolves the per-turn openai-compatible model from a hydrated custom-endpoint.json", () => {
  const dataDir = tmpDataDir();
  writeEndpoint(dataDir, { baseUrl: "http://box:11434/v1", model: "llama3.1" });
  const model = resolveTurnModel(dataDir, OPENAI_COMPATIBLE) as ResolvedModel;
  expect(model.provider).toBe(OPENAI_COMPATIBLE);
  expect(model.id).toBe("llama3.1");
  expect(model.baseUrl).toBe("http://box:11434/v1");
});

test("a per-turn pin matching the local model resolves that model", () => {
  const dataDir = tmpDataDir();
  writeEndpoint(dataDir, { baseUrl: "http://box:11434/v1", model: "llama3.1" });
  const model = resolveTurnModel(
    dataDir,
    OPENAI_COMPATIBLE,
    "llama3.1",
  ) as ResolvedModel;
  expect(model.id).toBe("llama3.1");
});

test("fails loudly when openai-compatible is active but no endpoint was hydrated", () => {
  const dataDir = tmpDataDir();
  // No custom-endpoint.json in the hydrated dir: the turn must surface a clear
  // error, never silently fall back to another provider or a default model.
  expect(() => resolveTurnModel(dataDir, OPENAI_COMPATIBLE)).toThrow(
    /No local model configured/,
  );
});

test("refuses a per-turn pin naming a model the local endpoint does not serve", () => {
  const dataDir = tmpDataDir();
  writeEndpoint(dataDir, { baseUrl: "http://box:11434/v1", model: "llama3.1" });
  expect(() =>
    resolveTurnModel(dataDir, OPENAI_COMPATIBLE, "claude-haiku-4.5"),
  ).toThrow(/local endpoint serves/);
});

test("a non-custom provider still resolves through the pi catalog", () => {
  const dataDir = tmpDataDir();
  const model = resolveTurnModel(dataDir, "anthropic") as ResolvedModel;
  expect(model.provider).toBe("anthropic");
});
