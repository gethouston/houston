import { getSupportedThinkingLevels } from "@earendil-works/pi-ai";
import {
  completeSimple,
  getModel,
  getModels,
} from "@earendil-works/pi-ai/compat";
import { builtinProviders } from "@earendil-works/pi-ai/providers/all";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { piModelIds } from "./pi-catalog";

type ModelId = Parameters<typeof getModel>[1];
type ProviderId = Parameters<typeof getModel>[0];

const NEON_COST = { input: 3, output: 15, cacheRead: 0.15 };

const GOOGLE_LEVELS = ["low", "medium", "high", "xhigh"];

const ROWS: ReadonlyArray<{
  provider: ProviderId;
  id: string;
  sibling: string;
  contextWindow: number;
  maxTokens: number;
  levels?: string[];
}> = [
  {
    provider: "google",
    id: "gemini-4-neon",
    sibling: "gemini-4-argon",
    contextWindow: 1_048_576,
    maxTokens: 65_536,
    levels: GOOGLE_LEVELS,
  },
  {
    provider: "google-vertex",
    id: "gemini-4-neon",
    sibling: "gemini-4-argon",
    contextWindow: 1_048_576,
    maxTokens: 65_536,
    levels: GOOGLE_LEVELS,
  },
  {
    provider: "opencode",
    id: "gemini-4-neon",
    sibling: "gemini-4-argon",
    contextWindow: 1_048_576,
    maxTokens: 65_536,
    levels: GOOGLE_LEVELS,
  },
  {
    provider: "openrouter",
    id: "google/gemini-4-neon",
    sibling: "google/gemini-4-argon",
    contextWindow: 1_048_576,
    maxTokens: 943_718,
    levels: GOOGLE_LEVELS,
  },
  {
    provider: "github-copilot",
    id: "gemini-4-neon",
    sibling: "gemini-4-argon",
    contextWindow: 1_048_576,
    maxTokens: 65_536,
    levels: GOOGLE_LEVELS,
  },
  {
    provider: "vercel-ai-gateway",
    id: "google/gemini-4-neon",
    sibling: "google/gemini-4-argon",
    contextWindow: 1_000_000,
    maxTokens: 1_000_000,
  },
];

test.each(
  ROWS,
)("$provider $id carries the published shape on every read path", (row) => {
  const model = getModel(row.provider, row.id as ModelId);
  const sibling = getModel(row.provider, row.sibling as ModelId);
  expect(model).toBeDefined();
  expect(model).toMatchObject({
    id: row.id,
    name: sibling.name.replace("Argon", "Neon"),
    provider: sibling.provider,
    api: sibling.api,
    baseUrl: sibling.baseUrl,
    contextWindow: row.contextWindow,
    maxTokens: row.maxTokens,
    reasoning: true,
    input: ["text", "image"],
    cost: NEON_COST,
  });
  expect(getSupportedThinkingLevels(model)).toEqual(
    row.levels ?? getSupportedThinkingLevels(sibling),
  );
  expect(getModels(row.provider).find((m) => m.id === row.id)).toEqual(model);
  expect(
    builtinProviders()
      .find((p) => p.id === row.provider)
      ?.getModels()
      .find((m) => m.id === row.id),
  ).toEqual(model);
  expect(piModelIds(row.provider)).toContain(row.id);
});

test("Argon still stops at high: Google answers 400 to XHIGH on it", () => {
  expect(
    getSupportedThinkingLevels(getModel("google", "gemini-4-argon")),
  ).toEqual(["low", "medium", "high"]);
});

let captured: { thinkingLevel?: string } | undefined;
const realFetch = globalThis.fetch;

beforeEach(() => {
  captured = undefined;
  globalThis.fetch = vi.fn(async (_input: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as {
      generationConfig?: { thinkingConfig?: { thinkingLevel?: string } };
    };
    captured = body.generationConfig?.thinkingConfig;
    return new Response(
      JSON.stringify({
        error: { code: 400, message: "captured", status: "INVALID_ARGUMENT" },
      }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

async function sentLevel(reasoning?: "minimal" | "xhigh") {
  await completeSimple(
    getModel("google", "gemini-4-neon"),
    { messages: [{ role: "user", content: "ping", timestamp: Date.now() }] },
    { apiKey: "test-key", maxTokens: 1, ...(reasoning ? { reasoning } : {}) },
  );
  return captured?.thinkingLevel;
}

test("xhigh goes out as Google's XHIGH level", async () => {
  expect(await sentLevel("xhigh")).toBe("XHIGH");
});

test("minimal and no level both go out as LOW, never MINIMAL", async () => {
  expect(await sentLevel("minimal")).toBe("LOW");
  expect(await sentLevel()).toBe("LOW");
});
