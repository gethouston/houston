import { afterEach, beforeEach, expect, test, vi } from "vitest";

const startLogin = vi.fn();

vi.mock("@houston/runtime-client", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@houston/runtime-client")>();
  return {
    ...actual,
    HoustonEngineClient: class {
      startLogin = startLogin;
      authStatus = async () => ({ providers: [] });
    },
  };
});

import { bus } from "@houston/engine-adapter/bus";
import { HoustonClient } from "@houston/engine-adapter/client";

beforeEach(() => {
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
