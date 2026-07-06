import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeAll, expect, test } from "vitest";

/**
 * End-to-end gates for a pasted key on an UNCURATED pi provider (groq): connect
 * (setApiKey) → select (activeProvider / claimActiveProvider) → resolve
 * (modelFor / resolveModel). These touch the singleton auth.json + settings.json,
 * so we bind a throwaway HOUSTON_HOME BEFORE the runtime modules evaluate (config
 * reads dataDir at import) and load them dynamically — the tests run against a
 * clean store, never the developer's ~/.houston. groq stands in for any of pi's
 * ~35 providers Houston hasn't hand-curated: api-key, non-OAuth, real catalog.
 */
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
  // Reset credentials + saved settings so each test starts from a clean store
  // (the singletons persist across tests in the file).
  for (const id of ["groq", "anthropic", "openrouter"])
    storage.authStorage.logout(id);
  rmSync(settingsFile, { force: true });
});

test("setApiKey accepts an uncurated pi provider's key; it then selects and resolves", () => {
  // The connect gate now treats a pi non-OAuth provider as api-key, so the paste
  // persists instead of 502-ing on an unknown provider.
  expect(() => login.setApiKey("groq", "gsk_test_key")).not.toThrow();

  // Stored → connected → the only connected provider, so the first-connected
  // fallback (nothing saved yet) reaches the pi extra and makes groq active.
  expect(providers.activeProvider()).toBe("groq");

  // modelFor falls back to groq's first pi model — no curated default, no throw.
  expect(providers.modelFor("groq")).toBe("llama-3.1-8b-instant");

  // And the live turn path resolves a real groq model.
  const m = providers.resolveModel() as { provider?: string; id?: string };
  expect(m.provider).toBe("groq");
  expect(m.id).toBe("llama-3.1-8b-instant");

  // The status batch reflects the connected pi provider with its runnable ids.
  const row = providers.listProviders().find((p) => p.id === "groq");
  expect(row?.configured).toBe(true);
  expect(row?.isActive).toBe(true);
  expect(row?.models).toContain("llama-3.1-8b-instant");
});

test("a stored uncurated-provider credential is claimable as active", () => {
  login.setApiKey("groq", "gsk_test_key");
  // A fresh agent (nothing saved, groq the only connected provider) claims groq
  // so its first turn works without a manual pick.
  const claimed = providers.claimActiveProvider("groq");
  expect(claimed.activeProvider).toBe("groq");
  expect(providers.activeProvider()).toBe("groq");
});

test("a connected pi extra never displaces a connected curated provider (precedence unchanged)", () => {
  // Both a curated provider (anthropic) and an uncurated pi one (groq) connected,
  // nothing saved: the curated one stays the first-connected pick — pi extras are
  // APPENDED to the candidate order, never interleaved, so they can only ever be
  // the fallback when NO curated provider is connected.
  storage.authStorage.set("anthropic", {
    type: "api_key",
    key: "sk-ant-oat01-x",
  });
  login.setApiKey("groq", "gsk_test_key");
  expect(providers.activeProvider()).toBe("anthropic");
  // A connect of the pi extra must NOT move the already-serving curated fallback.
  expect(providers.claimActiveProvider("groq").activeProvider).toBe(
    "anthropic",
  );
});

test("curated providers keep their configured defaults (no regression)", () => {
  // The catalog source-of-truth widen must not perturb curated resolution.
  expect(providers.providerDefaultModel("anthropic")).toBe("claude-sonnet-4-6");
  expect(providers.providerAuthMethod("anthropic")).toBe("oauth");
  expect(providers.providerAuthMethod("openai-codex")).toBe("oauth");
  // opencode is an open-catalog gateway (getModels → []) that keeps its curated
  // api-key auth and configured default.
  expect(providers.providerAuthMethod("opencode")).toBe("apiKey");
  expect(providers.providerDefaultModel("opencode")).toBe("claude-sonnet-4-6");
});
