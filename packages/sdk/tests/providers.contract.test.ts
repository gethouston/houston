import { type FakeHost, SEED_AGENT_ID } from "@houston/fake-host";
import {
  ProvidersCommand,
  type ProvidersViewModel,
  type ProviderVM,
  providersScope,
} from "@houston/sdk";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { type Harness, makeSdk, resetHost, startHost } from "./harness";

let host: FakeHost;
beforeAll(async () => {
  host = await startHost();
});
afterAll(async () => {
  await host.stop();
});

let h: Harness;
beforeEach(async () => {
  await resetHost(host.url);
  h = makeSdk(host.url);
});
afterEach(() => {
  h.sdk.dispose();
});

const scope = providersScope(SEED_AGENT_ID);
const vm = (): ProvidersViewModel | undefined =>
  h.sdk.getSnapshot(scope) as ProvidersViewModel | undefined;
const find = (id: string): ProviderVM | undefined =>
  vm()?.providers.find((p) => p.id === id);

describe("providers VM — list + status merge", () => {
  it("merges GET /providers + GET /auth/status into a pinned snapshot", async () => {
    await h.sdk.providers.refresh(SEED_AGENT_ID);
    expect(vm()?.loaded).toBe(true);
    expect(vm()?.activeProvider).toBe("anthropic");

    expect(find("anthropic")).toEqual({
      id: "anthropic",
      name: "Anthropic (Claude)",
      configured: true,
      isActive: true,
      activeModel: "claude-sonnet-4-6",
      models: ["claude-sonnet-4-6", "claude-opus-4-8"],
      login: null,
    });

    expect(find("openai-codex")).toMatchObject({
      configured: false,
      isActive: false,
      login: null,
    });
    expect(find("github-copilot")).toMatchObject({ enterpriseUrl: null });
  });

  it("scope key is 'providers/<agentId>'", () => {
    expect(providersScope("abc")).toBe("providers/abc");
  });
});

describe("providers — login returns the LoginInfo kind verbatim", () => {
  it("openai-codex → device_code; anthropic → auth_code; surfaces awaiting", async () => {
    await h.sdk.providers.refresh(SEED_AGENT_ID);

    const codex = await h.sdk.providers.login(SEED_AGENT_ID, "openai-codex");
    expect(codex).toEqual({
      kind: "device_code",
      verificationUri: expect.any(String),
      userCode: expect.any(String),
    });

    const claude = await h.sdk.providers.login(SEED_AGENT_ID, "anthropic");
    expect(claude.kind).toBe("auth_code");
    if (claude.kind === "auth_code") expect(claude.url).toMatch(/^https?:/);

    expect(find("openai-codex")?.login?.status).toBe("awaiting_user");
    expect(find("anthropic")?.login?.status).toBe("awaiting_user");
  });

  it("carries the Copilot Enterprise domain through login", async () => {
    await h.sdk.providers.login(SEED_AGENT_ID, "github-copilot", {
      enterpriseDomain: "acme.ghe.com",
    });
    expect(find("github-copilot")?.enterpriseUrl).toBe("acme.ghe.com");
  });
});

describe("providers — login polling contract (surface polls; SDK imperative)", () => {
  it("refreshStatus reads /auth/status only; completeLogin flips configured", async () => {
    await h.sdk.providers.refresh(SEED_AGENT_ID);
    const info = await h.sdk.providers.login(SEED_AGENT_ID, "openai-codex");
    expect(info.kind).toBe("device_code");

    await h.sdk.providers.refreshStatus(SEED_AGENT_ID);
    expect(find("openai-codex")?.configured).toBe(false);
    expect(find("openai-codex")?.login?.status).toBe("awaiting_user");
    expect(find("openai-codex")?.models).toEqual(["gpt-5-codex", "o4-mini"]);

    await h.sdk.providers.completeLogin(
      SEED_AGENT_ID,
      "openai-codex",
      "code-1",
    );
    expect(find("openai-codex")?.configured).toBe(true);
    expect(find("openai-codex")?.login ?? null).toBeNull();
  });

  it("cancelLogin clears the in-flight login state", async () => {
    await h.sdk.providers.login(SEED_AGENT_ID, "openai-codex");
    expect(find("openai-codex")?.login?.status).toBe("awaiting_user");
    await h.sdk.providers.cancelLogin(SEED_AGENT_ID, "openai-codex");
    expect(find("openai-codex")?.login ?? null).toBeNull();
  });
});

describe("providers — credential mutations refetch", () => {
  it("setApiKey flips an api-key provider to configured", async () => {
    await h.sdk.providers.refresh(SEED_AGENT_ID);
    expect(find("openrouter")?.configured).toBe(false);

    await h.sdk.providers.setApiKey(SEED_AGENT_ID, "openrouter", "sk-test");
    expect(find("openrouter")?.configured).toBe(true);
  });

  it("logout disconnects and drops the active provider", async () => {
    await h.sdk.providers.refresh(SEED_AGENT_ID);
    expect(find("anthropic")?.configured).toBe(true);

    await h.sdk.providers.logout(SEED_AGENT_ID, "anthropic");
    expect(find("anthropic")?.configured).toBe(false);
    expect(vm()?.activeProvider).toBeUndefined();
  });
});

describe("providers — setModel (resolveModelSettings semantics)", () => {
  it("writes {activeProvider, model} pairing a model with its owner", async () => {
    await h.sdk.providers.setModel(SEED_AGENT_ID, { model: "claude-opus-4-8" });
    expect(vm()?.activeProvider).toBe("anthropic");
    expect(find("anthropic")?.activeModel).toBe("claude-opus-4-8");
    expect(find("anthropic")?.isActive).toBe(true);
  });

  it("switches the active provider when the model belongs to another", async () => {
    await h.sdk.providers.setModel(SEED_AGENT_ID, { model: "gpt-5-codex" });
    expect(vm()?.activeProvider).toBe("openai-codex");
    expect(find("openai-codex")?.activeModel).toBe("gpt-5-codex");
  });

  it("honors an explicit provider override with no model", async () => {
    await h.sdk.providers.setModel(SEED_AGENT_ID, {
      provider: "github-copilot",
    });
    expect(vm()?.activeProvider).toBe("github-copilot");
  });
});

describe("providers — dispatch parity", () => {
  it("runs refresh + login through the same handlers, and rejects a bad payload", async () => {
    const refreshed = await h.sdk.dispatch({
      id: "c1",
      type: ProvidersCommand.Refresh,
      payload: { agentId: SEED_AGENT_ID },
    });
    expect(refreshed).toMatchObject({ id: "c1", ok: true });
    expect(vm()?.loaded).toBe(true);

    const login = await h.sdk.dispatch({
      id: "c2",
      type: ProvidersCommand.Login,
      payload: { agentId: SEED_AGENT_ID, provider: "anthropic" },
    });
    expect(login).toMatchObject({
      id: "c2",
      ok: true,
      value: { kind: "auth_code" },
    });

    const bad = await h.sdk.dispatch({
      id: "c3",
      type: ProvidersCommand.SetApiKey,
      payload: { agentId: SEED_AGENT_ID },
    });
    expect(bad).toMatchObject({ id: "c3", ok: false });
  });
});
