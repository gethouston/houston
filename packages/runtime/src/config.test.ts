import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_MODEL } from "@houston/domain/provider-default-models";
import { afterEach, expect, test, vi } from "vitest";

/**
 * The two facts the process learns about itself from its environment: WHAT it
 * is (an ordinary agent, or the user's assistant coordinator) and whether the
 * assistant tool family is on. The family reaches the user's whole account, so
 * it takes BOTH the role the host gave this runtime and a host to proxy to —
 * neither alone, and never anything this process could infer about itself.
 *
 * Plus the one thing it must NOT learn from itself: which model each provider
 * defaults to. That is the domain table's answer, and the drift test at the
 * bottom is what keeps this file from growing a second copy of it.
 */

const OWNED = [
  // The per-provider model overrides: cleared so the defaults under test are
  // the code's, never whatever the developer exported into this shell.
  "HOUSTON_MODEL",
  "HOUSTON_CODEX_MODEL",
  "HOUSTON_GITHUB_COPILOT_MODEL",
  "HOUSTON_GEMINI_MODEL",
  "HOUSTON_BEDROCK_MODEL",
  "HOUSTON_MINIMAX_MODEL",
  "HOUSTON_OPENROUTER_MODEL",
  "HOUSTON_DEEPSEEK_MODEL",
  "HOUSTON_OPENCODE_MODEL",
  "HOUSTON_OPENCODE_GO_MODEL",
  "HOUSTON_ASSISTANT_ROLE",
  "HOUSTON_ASSISTANT_CP_URL",
  "HOUSTON_ASSISTANT_TOKEN",
  "HOUSTON_CONTROL_PLANE_URL",
  "HOUSTON_SANDBOX_TOKEN",
  "HOUSTON_WORKSPACE_DIR",
  "HOUSTON_DATA_DIR",
] as const;

const prior = new Map(OWNED.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of OWNED) {
    const value = prior.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

async function loadConfig(env: Record<string, string>) {
  for (const key of OWNED) delete process.env[key];
  process.env.HOUSTON_WORKSPACE_DIR = mkdtempSync(join(tmpdir(), "hcfg-ws-"));
  process.env.HOUSTON_DATA_DIR = mkdtempSync(join(tmpdir(), "hcfg-data-"));
  Object.assign(process.env, env);
  vi.resetModules();
  return (await import("./config")).config;
}

const REACHABLE = {
  HOUSTON_CONTROL_PLANE_URL: "http://127.0.0.1:4318",
  HOUSTON_SANDBOX_TOKEN: "sandbox-token",
};

test("the coordinator role comes from the host, and turns the family on", async () => {
  const config = await loadConfig({
    ...REACHABLE,
    HOUSTON_ASSISTANT_ROLE: "coordinator",
  });
  expect(config.assistantRole).toBe("coordinator");
  expect(config.assistantEnabled).toBe(true);
});

test("an ordinary agent has no role and no family, gateway pair or not", async () => {
  const config = await loadConfig({
    ...REACHABLE,
    // A desktop host is its own assistant gateway, so this pair says nothing
    // about whether the runtime holding it is the user's assistant.
    HOUSTON_ASSISTANT_CP_URL: "http://127.0.0.1:4318",
    HOUSTON_ASSISTANT_TOKEN: "boot-token",
  });
  expect(config.assistantRole).toBeNull();
  expect(config.assistantEnabled).toBe(false);
});

test("the coordinator with no host to proxy to gets no family", async () => {
  // Every call would be unroutable: offering the tools would have the assistant
  // promise the user operations it cannot perform.
  const config = await loadConfig({ HOUSTON_ASSISTANT_ROLE: "coordinator" });
  expect(config.assistantRole).toBe("coordinator");
  expect(config.assistantEnabled).toBe(false);
});

/**
 * The provider each runtime default answers for. Written out (rather than
 * derived) so ADDING a provider default without a domain entry — the exact
 * shape of the old drift — fails here instead of being skipped silently.
 */
const DEFAULTS_BY_PROVIDER: Record<
  string,
  (config: Awaited<ReturnType<typeof loadConfig>>) => string
> = {
  anthropic: (c) => c.model,
  "openai-codex": (c) => c.codexModel,
  "github-copilot": (c) => c.githubCopilotModel,
  google: (c) => c.geminiModel,
  "amazon-bedrock": (c) => c.bedrockModel,
  minimax: (c) => c.minimaxModel,
  openrouter: (c) => c.openrouterModel,
  deepseek: (c) => c.deepseekModel,
  opencode: (c) => c.opencodeModel,
  "opencode-go": (c) => c.opencodeGoModel,
};

test("every provider default IS the domain table's value", async () => {
  // The table is what the app's picker pre-selects and what the on-disk
  // migration rewrites an unplaceable stored model to. A runtime that answered
  // a turn on a different id than the one being written to the user's config is
  // the drift this test exists to make impossible.
  const config = await loadConfig({});
  for (const [provider, read] of Object.entries(DEFAULTS_BY_PROVIDER)) {
    expect(read(config), provider).toBe(DEFAULT_MODEL[provider]);
  }
});

test("env overrides still win over the table", async () => {
  const config = await loadConfig({ HOUSTON_MODEL: "claude-opus-5" });
  expect(config.model).toBe("claude-opus-5");
});

test("the table carries a default for every provider the runtime names", () => {
  for (const provider of Object.keys(DEFAULTS_BY_PROVIDER)) {
    expect(DEFAULT_MODEL[provider], provider).toBeTypeOf("string");
  }
});
