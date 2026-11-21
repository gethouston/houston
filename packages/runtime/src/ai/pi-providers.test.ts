import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeAll, expect, test } from "vitest";

const HOME = mkdtempSync(join(tmpdir(), "houston-pi-prov-"));
process.env.HOUSTON_HOME = HOME;
const settingsFile = join(HOME, "data", "settings.json");

let login: typeof import("../auth/login");
let providers: typeof import("./providers");
let storage: typeof import("../auth/storage");

beforeAll(async () => {
  login = await import("../auth/login");
  providers = await import("./providers");
  storage = await import("../auth/storage");
});

afterEach(() => {
  for (const id of ["groq", "anthropic", "openrouter"])
    storage.authStorage.remove(id);
  rmSync(settingsFile, { force: true });
});

test("an uncurated provider with a domain default starts on it, not pi's first row", () => {
  expect(providers.modelFor("mistral")).toBe("mistral-large-4");
});

test("setApiKey accepts an uncurated pi provider's key; it then selects and resolves", () => {
  expect(() => login.setApiKey("groq", "gsk_test_key")).not.toThrow();

  expect(providers.activeProvider()).toBe("groq");

  expect(providers.modelFor("groq")).toBe("llama-3.1-8b-instant");

  const m = providers.resolveModel() as { provider?: string; id?: string };
  expect(m.provider).toBe("groq");
  expect(m.id).toBe("llama-3.1-8b-instant");

  const row = providers.listProviders().find((p) => p.id === "groq");
  expect(row?.configured).toBe(true);
  expect(row?.isActive).toBe(true);
  expect(row?.models).toContain("llama-3.1-8b-instant");
});

test("a stored uncurated-provider credential is claimable as active", () => {
  login.setApiKey("groq", "gsk_test_key");
  const claimed = providers.claimActiveProvider("groq");
  expect(claimed.activeProvider).toBe("groq");
  expect(providers.activeProvider()).toBe("groq");
});

test("a connected pi extra never displaces a connected curated provider (precedence unchanged)", () => {
  storage.authStorage.set("anthropic", {
    type: "api_key",
    key: "sk-ant-oat01-x",
  });
  login.setApiKey("groq", "gsk_test_key");
  expect(providers.activeProvider()).toBe("anthropic");
  expect(providers.claimActiveProvider("groq").activeProvider).toBe(
    "anthropic",
  );
});

test("curated providers keep their configured defaults (no regression)", () => {
  expect(providers.providerDefaultModel("anthropic")).toBe("claude-sonnet-5-5");
  expect(providers.providerAuthMethod("anthropic")).toBe("oauth");
  expect(providers.providerAuthMethod("openai-codex")).toBe("oauth");
  expect(providers.providerAuthMethod("opencode")).toBe("apiKey");
  expect(providers.providerDefaultModel("opencode")).toBe("claude-sonnet-4-6");
});

test("an agent saved on an unoffered Claude id reports the default it runs", () => {
  providers.setSettings({
    activeProvider: "anthropic",
    model: "claude-2.1",
  });
  const m = providers.resolveModel(null, "anthropic") as { id?: string };
  expect(m.id).toBe("claude-sonnet-5-5");
  const row = providers.listProviders().find((p) => p.id === "anthropic");
  expect(row?.activeModel).toBe("claude-sonnet-5-5");
});

test("an agent saved on a retired Claude id runs and reports its family's lineup model", () => {
  providers.setSettings({
    activeProvider: "anthropic",
    model: "claude-opus-4-8",
  });
  const m = providers.resolveModel(null, "anthropic") as { id?: string };
  expect(m.id).toBe("claude-opus-5-5");
  const row = providers.listProviders().find((p) => p.id === "anthropic");
  expect(row?.activeModel).toBe("claude-opus-5-5");
  expect(row?.models).toEqual([
    "claude-sonnet-5-5",
    "claude-opus-5-5",
    "claude-fable-5-2",
    "claude-haiku-5-5",
  ]);
});

test("an agent saved on Haiku 4.5 runs and reports Haiku 5.5", () => {
  providers.setSettings({
    activeProvider: "anthropic",
    model: "claude-haiku-4-5",
  });
  const m = providers.resolveModel(null, "anthropic") as { id?: string };
  expect(m.id).toBe("claude-haiku-5-5");
  const row = providers.listProviders().find((p) => p.id === "anthropic");
  expect(row?.activeModel).toBe("claude-haiku-5-5");
});
