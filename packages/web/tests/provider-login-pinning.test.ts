import { beforeEach, expect, test, vi } from "vitest";

// HOU-1113 — the submit/cancel side of a cloud provider login must land on the
// SAME runtime the login started in. `providerAgentId()` re-derived at call
// time moves when the first agent materializes mid-login (onboarding tears the
// setup pod down at that moment), so the relayed OAuth code hit a pod that
// never saw the login: `no active login for openai-codex`. These pin the
// routing to the connect poll's `activeLogins` registration.

const mocks = vi.hoisted(() => ({
  agentComplete: vi.fn<() => Promise<void>>(),
  setupComplete: vi.fn<() => Promise<void>>(),
  agentCancel: vi.fn<() => Promise<void>>(),
  setupCancel: vi.fn<() => Promise<void>>(),
  runtimeClientFor: vi.fn(),
}));

vi.mock("../src/engine-adapter/control-plane", () => ({
  captureCredential: vi.fn(),
  captureSetupCredential: vi.fn(),
  runtimeClientFor: mocks.runtimeClientFor.mockImplementation(() => ({
    completeLogin: mocks.agentComplete,
    cancelLogin: mocks.agentCancel,
  })),
  setupRuntimeClientFor: () => ({
    completeLogin: mocks.setupComplete,
    cancelLogin: mocks.setupCancel,
  }),
}));

beforeEach(() => {
  mocks.agentComplete.mockReset().mockResolvedValue();
  mocks.setupComplete.mockReset().mockResolvedValue();
  mocks.agentCancel.mockReset().mockResolvedValue();
  mocks.setupCancel.mockReset().mockResolvedValue();
  mocks.runtimeClientFor.mockClear();
});

const { pinnedLoginAgentId, loginKey } = await import(
  "../src/engine-adapter/client/provider-login-poll"
);
const { ProviderLoginMixin } = await import(
  "../src/engine-adapter/client/provider-login-mixin"
);

type Ctx = {
  cp: { baseUrl: string; token: string };
  activeLogins: Set<string>;
  providerEngine: () => unknown;
  providerEngineFor: (id: string) => unknown;
  providerAgentId: () => string | null;
};

function makeClient(ctx: Ctx) {
  const Client = ProviderLoginMixin(
    class {
      ctx: Ctx;
      constructor(c: Ctx) {
        this.ctx = c;
      }
    } as never,
  );
  return new Client(ctx) as InstanceType<typeof Client> & { ctx: Ctx };
}

function context(overrides: Partial<Ctx> = {}): Ctx {
  return {
    cp: { baseUrl: "https://example.test", token: "token" },
    activeLogins: new Set<string>(),
    // Re-derivation must NOT be consulted when a pin exists.
    providerEngine: () => {
      throw new Error("re-derived routing instead of using the pin");
    },
    providerEngineFor: (id: string) => mocks.runtimeClientFor(undefined, id),
    providerAgentId: () => null,
    ...overrides,
  };
}

test("pinnedLoginAgentId: no in-flight login → undefined", () => {
  expect(
    pinnedLoginAgentId(context() as never, "openai-codex"),
  ).toBeUndefined();
});

test("pinnedLoginAgentId: setup-runtime login → null", () => {
  const ctx = context();
  ctx.activeLogins.add(loginKey(null, "openai-codex"));
  expect(pinnedLoginAgentId(ctx as never, "openai-codex")).toBeNull();
});

test("pinnedLoginAgentId: agent login → the agent id", () => {
  const ctx = context();
  ctx.activeLogins.add(loginKey("agent-1", "openai-codex"));
  expect(pinnedLoginAgentId(ctx as never, "openai-codex")).toBe("agent-1");
});

test("pinnedLoginAgentId: newest of concurrent logins wins", () => {
  const ctx = context();
  ctx.activeLogins.add(loginKey(null, "openai-codex"));
  ctx.activeLogins.add(loginKey("agent-1", "openai-codex"));
  expect(pinnedLoginAgentId(ctx as never, "openai-codex")).toBe("agent-1");
});

test("pinnedLoginAgentId: a dash-suffixed provider never cross-matches", () => {
  const ctx = context();
  ctx.activeLogins.add(loginKey("agent-1", "openai-codex"));
  expect(pinnedLoginAgentId(ctx as never, "codex")).toBeUndefined();
});

test("submit routes to the setup runtime the login started in, even after an agent appears", async () => {
  const ctx = context({
    // The first agent materialized mid-login: live derivation now names it.
    providerAgentId: () => "agent-1",
  });
  ctx.activeLogins.add(loginKey(null, "openai-codex"));

  await makeClient(ctx).submitProviderLoginCode("openai", "code=abc&state=xyz");

  expect(mocks.setupComplete).toHaveBeenCalledWith(
    "openai-codex",
    "code=abc&state=xyz",
  );
  expect(mocks.agentComplete).not.toHaveBeenCalled();
});

test("submit routes to the pinned agent runtime when the login started there", async () => {
  const ctx = context();
  ctx.activeLogins.add(loginKey("agent-1", "openai-codex"));

  await makeClient(ctx).submitProviderLoginCode("openai", "code=abc");

  expect(mocks.runtimeClientFor).toHaveBeenCalledWith(ctx.cp, "agent-1");
  expect(mocks.setupComplete).not.toHaveBeenCalled();
});

test("cancel tears down the pinned setup login, not the re-derived agent", async () => {
  const ctx = context({ providerAgentId: () => "agent-1" });
  const key = loginKey(null, "openai-codex");
  ctx.activeLogins.add(key);

  await makeClient(ctx).cancelProviderLogin("openai");

  expect(ctx.activeLogins.has(key)).toBe(false);
  expect(mocks.setupCancel).toHaveBeenCalledWith("openai-codex");
  expect(mocks.agentCancel).not.toHaveBeenCalled();
});
