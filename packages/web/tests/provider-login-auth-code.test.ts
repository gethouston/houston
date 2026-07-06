import { afterEach, beforeEach, expect, test, vi } from "vitest";

/**
 * The Claude/Anthropic connect uses the sanctioned setup-token flow: the
 * runtime returns a `{ kind: "auth_code", url: <docs cli-reference>,
 * instructions }` LoginInfo where the url is only a docs reference and the user
 * finishes by pasting a token. The adapter MUST forward both `auth_code: true`
 * and `instructions` on the `ProviderLoginUrl` bus event so the app shows the
 * paste dialog (with the steps) instead of auto-opening the docs page — the
 * reported bug. A co-located loopback `url` login stays `auth_code: false`.
 */

const startLogin = vi.fn();

vi.mock("@houston/runtime-client", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@houston/runtime-client")>();
  return {
    ...actual,
    HoustonEngineClient: class {
      startLogin = startLogin;
      // watchLoginCompletion polls this; empty providers keeps it a no-op.
      authStatus = async () => ({ providers: [] });
    },
  };
});

import { bus } from "../src/engine-adapter/bus";
import { HoustonClient } from "../src/engine-adapter/client";

beforeEach(() => {
  // Freeze the login-completion poll interval so it never fires during the test.
  vi.useFakeTimers();
  startLogin.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

function client() {
  return new HoustonClient({ baseUrl: "http://host", token: "t" });
}

function captureLoginUrl(): Array<{
  type: string;
  data: Record<string, unknown>;
}> {
  const events: Array<{ type: string; data: Record<string, unknown> }> = [];
  bus.on((e) =>
    events.push(e as { type: string; data: Record<string, unknown> }),
  );
  return events;
}

test("anthropic setup-token: ProviderLoginUrl carries auth_code:true + instructions, no user_code", async () => {
  startLogin.mockResolvedValue({
    kind: "auth_code",
    url: "https://docs.claude.com/en/docs/claude-code/cli-reference",
    instructions:
      "Run `claude setup-token` in your terminal, then paste the token it prints (starts with sk-ant-oat01).",
  });

  const events = captureLoginUrl();
  await client().providerLogin("anthropic");

  const login = events.find((e) => e.type === "ProviderLoginUrl");
  expect(login).toBeDefined();
  expect(login?.data.provider).toBe("anthropic");
  expect(login?.data.auth_code).toBe(true);
  expect(login?.data.instructions).toMatch(/claude setup-token/);
  // Paste flow, not device-grant.
  expect(login?.data.user_code).toBeNull();
});

test("co-located loopback url: ProviderLoginUrl stays auth_code:false with no instructions", async () => {
  startLogin.mockResolvedValue({
    kind: "url",
    url: "https://auth.openai.com/authorize?client_id=abc",
  });

  const events = captureLoginUrl();
  await client().providerLogin("openai");

  const login = events.find((e) => e.type === "ProviderLoginUrl");
  expect(login).toBeDefined();
  expect(login?.data.auth_code).toBe(false);
  expect(login?.data.instructions).toBeUndefined();
});
