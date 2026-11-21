import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

process.env.HOUSTON_DATA_DIR = mkdtempSync(join(tmpdir(), "houston-turn-log-"));
process.env.HOUSTON_WORKSPACE_DIR = mkdtempSync(
  join(tmpdir(), "houston-turn-log-ws-"),
);

const state = vi.hoisted(() => ({ saved: "anthropic" as string | null }));
vi.mock("../ai/providers", async (importOriginal) => {
  const real = await importOriginal<typeof import("../ai/providers")>();
  return {
    ...real,
    activeProvider: () => state.saved,
    resolveModel: (model?: string | null, provider?: string | null) => {
      if (provider === "openai-codex")
        return {
          provider: "openai-codex",
          id: model ?? "gpt-6-astra",
          baseUrl: "https://chatgpt.com/backend-api",
        };
      if (!state.saved)
        throw new Error("No provider connected. Connect an AI provider first.");
      return {
        provider: "anthropic",
        id: "claude-sonnet-5",
        baseUrl: "https://api.anthropic.com",
      };
    },
  };
});

const { ensureProviderForTurn } = await import("./chat");

let logged: string[] = [];
beforeEach(() => {
  logged = [];
  state.saved = "anthropic";
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logged.push(args.map(String).join(" "));
  });
});
afterEach(() => vi.restoreAllMocks());

const turnLine = () => logged.find((l) => l.startsWith("[turn] provider="));

test("the turn diagnostic names the PINNED provider and model, not the agent default", async () => {
  expect(await ensureProviderForTurn({ provider: "openai-codex" })).toBe(
    "anthropic",
  );
  expect(turnLine()).toBe(
    "[turn] provider=openai-codex model=gpt-6-astra baseUrl=https://chatgpt.com/backend-api pinned=true",
  );
});

test("a pinned model without a provider is reported on the provider it rides", async () => {
  await ensureProviderForTurn({ model: "claude-opus-5" });
  expect(turnLine()).toContain("provider=anthropic");
  expect(turnLine()).toContain("pinned=true");
});

test("an unpinned turn reports the agent's own provider and says it is unpinned", async () => {
  await ensureProviderForTurn();
  expect(turnLine()).toBe(
    "[turn] provider=anthropic model=claude-sonnet-5 baseUrl=https://api.anthropic.com pinned=false",
  );
});

test("a request that is refused before it becomes a turn logs no [turn] line", async () => {
  state.saved = null;
  expect(await ensureProviderForTurn()).toBeNull();
  expect(turnLine()).toBeUndefined();
});
