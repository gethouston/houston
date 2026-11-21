import { createServer, type Server } from "node:net";
import { expect, test, vi } from "vitest";
import {
  CODEX_OAUTH_CALLBACK_PORT,
  CodexCallbackPortInUseError,
} from "./codex-port-preflight";
import {
  autoPromptAnswer,
  COPILOT_NO_ACCESS_ERROR,
  cancelLogin,
  codexLoginMethod,
  getAuthStatus,
  LOCAL_PLACEHOLDER_KEY,
  LOGIN_TIMEOUT_ERROR,
  LOGIN_TIMEOUT_MS,
  loginFailureMessage,
  OPENAI_CODEX_BROWSER_LOGIN_METHOD,
  OPENAI_CODEX_DEVICE_CODE_LOGIN_METHOD,
  setApiKey,
  startLogin,
} from "./login";
import { modelRuntime } from "./storage";

vi.mock("./anthropic-cli-binary", () => ({
  resolveClaudeCliBinary: () => null,
}));

function occupyCodexCallbackPort(): Promise<Server> {
  return new Promise<Server>((resolve, reject) => {
    const s = createServer();
    s.once("error", reject);
    s.listen(CODEX_OAUTH_CALLBACK_PORT, "127.0.0.1", () => resolve(s));
  });
}

function stubPiLogin(
  login: (
    interaction: import("@earendil-works/pi-ai").AuthInteraction,
  ) => Promise<import("@earendil-works/pi-ai").OAuthCredential> = (
    interaction,
  ) => {
    interaction.notify({
      type: "auth_url",
      url: "https://auth.example/codex",
    });
    return new Promise<never>(() => {});
  },
) {
  const oauthLogin = vi.fn(login);
  const spy = vi.spyOn(modelRuntime, "getProvider").mockImplementation(
    (id: string) =>
      ({
        id,
        name: id,
        auth: { oauth: { name: id, login: oauthLogin } },
      }) as never,
  );
  return Object.assign(spy, { oauthLogin });
}

test("openai-codex browser login preflights the callback port and fails fast when it is busy (no pi call, slot free)", async () => {
  const squatter = await occupyCodexCallbackPort();
  const piLogin = stubPiLogin();
  try {
    const started = Date.now();
    const err = await startLogin("openai-codex", false).catch(
      (e: unknown) => e,
    );
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(err).toBeInstanceOf(CodexCallbackPortInUseError);
    expect((err as Error).message).toContain("Close other AI coding tools");
    expect(piLogin).not.toHaveBeenCalled();
    expect(
      (await getAuthStatus()).providers.find(
        (p) => p.provider === "openai-codex",
      )?.login,
    ).toBeNull();

    await new Promise<void>((r) => squatter.close(() => r()));
    const info = await startLogin("openai-codex", false);
    expect(info.kind).toBe("url");
    expect(piLogin).toHaveBeenCalledTimes(1);
    cancelLogin("openai-codex");
    await new Promise((r) => setTimeout(r, 50));
  } finally {
    piLogin.mockRestore();
    if (squatter.listening)
      await new Promise<void>((r) => squatter.close(() => r()));
  }
});

test("a retry click during an in-flight codex browser login reuses the flow instead of reporting its own port busy", async () => {
  const pi: { server: Server | null } = { server: null };
  const piLogin = stubPiLogin(async (interaction) => {
    pi.server = await occupyCodexCallbackPort();
    interaction.notify({ type: "auth_url", url: "https://auth.example/codex" });
    return new Promise<never>(() => {});
  });
  try {
    const first = await startLogin("openai-codex", false);
    expect(first.kind).toBe("url");

    const second = await startLogin("openai-codex", false);
    expect(second).toBe(first);
    expect(piLogin.oauthLogin).toHaveBeenCalledTimes(1);
  } finally {
    cancelLogin("openai-codex");
    await new Promise((r) => setTimeout(r, 50));
    piLogin.mockRestore();
    const server = pi.server;
    if (server) await new Promise<void>((r) => server.close(() => r()));
  }
});

test("openai-codex device-code login does NOT preflight the callback port", async () => {
  const squatter = await occupyCodexCallbackPort();
  const piLogin = stubPiLogin();
  try {
    const info = await startLogin("openai-codex", true);
    expect(info.kind).toBe("url");
    expect(piLogin).toHaveBeenCalledTimes(1);
    cancelLogin("openai-codex");
    await new Promise((r) => setTimeout(r, 50));
  } finally {
    piLogin.mockRestore();
    await new Promise<void>((r) => squatter.close(() => r()));
  }
});

test("codexLoginMethod: browser login for any client that can catch/relay the loopback callback", () => {
  expect(codexLoginMethod({ deviceAuth: false })).toBe(
    OPENAI_CODEX_BROWSER_LOGIN_METHOD,
  );
});

test("codexLoginMethod: device code for any remote client (deviceAuth) — cloud and self-host", () => {
  expect(codexLoginMethod({ deviceAuth: true })).toBe(
    OPENAI_CODEX_DEVICE_CODE_LOGIN_METHOD,
  );
});

test("codexLoginMethod: browser login for a headless/remote runtime whose client relays the callback", () => {
  expect(codexLoginMethod({ deviceAuth: false })).toBe(
    OPENAI_CODEX_BROWSER_LOGIN_METHOD,
  );
});

test("autoPromptAnswer: github-copilot auto-answers the enterprise-domain prompt", () => {
  expect(autoPromptAnswer("github-copilot")).toBe("");
});

test("autoPromptAnswer: github-copilot forwards the Enterprise company domain", () => {
  expect(autoPromptAnswer("github-copilot", "acme.ghe.com")).toBe(
    "acme.ghe.com",
  );
  expect(autoPromptAnswer("anthropic", "acme.ghe.com")).toBeNull();
});

test("autoPromptAnswer: other providers defer to the user (null => paste promise)", () => {
  expect(autoPromptAnswer("anthropic")).toBeNull();
  expect(autoPromptAnswer("openai-codex")).toBeNull();
});

test("the OpenAI-compatible provider rejects the OAuth and api-key connect paths", async () => {
  await expect(startLogin("openai-compatible")).rejects.toThrow(/OAuth/);
  expect(() => setApiKey("openai-compatible", "k")).toThrow(/API key/);
});

test("setApiKey rejects an OAuth provider and an id pi-ai doesn't know", () => {
  expect(() => setApiKey("openai-codex", "sk-x")).toThrow(/API key/);
  expect(() => setApiKey("anthropic", "sk-x")).toThrow(/API key/);
  expect(() => setApiKey("not-a-real-provider", "sk-x")).toThrow(
    /unknown provider/,
  );
});

test("cancelLogin: benign with nothing in flight, throws on an unknown provider", () => {
  expect(() => cancelLogin("anthropic")).not.toThrow();
  expect(() => cancelLogin("not-a-provider")).toThrow(/unknown provider/);
});

test("cancelLogin: tears down the in-flight flow so a retry starts clean (HOU-664)", async () => {
  const first = await startLogin("anthropic");
  expect(first.kind).toBe("auth_code");
  expect(
    (await getAuthStatus()).providers.find((p) => p.provider === "anthropic")
      ?.login?.status,
  ).toBe("awaiting_user");

  cancelLogin("anthropic");

  expect(
    (await getAuthStatus()).providers.find((p) => p.provider === "anthropic")
      ?.login,
  ).toBeNull();

  await new Promise((r) => setTimeout(r, 100));
  const second = await startLogin("anthropic");
  expect(second.kind).toBe("auth_code");
  expect(second).not.toBe(first);
  cancelLogin("anthropic");
  await new Promise((r) => setTimeout(r, 100));
});

test("LOCAL_PLACEHOLDER_KEY exists for keyless local servers", () => {
  expect(LOCAL_PLACEHOLDER_KEY.length).toBeGreaterThan(0);
});

test("an abandoned login expires: reports 'Login timed out' and frees the flow for a retry", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const warnSpy = vi.spyOn(console, "warn");
  const errorSpy = vi.spyOn(console, "error");
  try {
    const first = await startLogin("anthropic");
    expect(first.kind).toBe("auth_code");

    await vi.advanceTimersByTimeAsync(LOGIN_TIMEOUT_MS + 1);

    const row = (await getAuthStatus()).providers.find(
      (p) => p.provider === "anthropic",
    );
    expect(row?.login?.status).toBe("error");
    expect(row?.login?.error).toBe(LOGIN_TIMEOUT_ERROR);

    const abandoned = (calls: unknown[][]) =>
      calls.some((args) => String(args[0]).includes("abandoned login"));
    expect(abandoned(warnSpy.mock.calls)).toBe(true);
    expect(abandoned(errorSpy.mock.calls)).toBe(false);

    const second = await startLogin("anthropic");
    expect(second).not.toBe(first);
    cancelLogin("anthropic");
    await vi.advanceTimersByTimeAsync(100);
  } finally {
    warnSpy.mockRestore();
    errorSpy.mockRestore();
    vi.useRealTimers();
  }
});

test("reusing an in-flight login re-arms the abandonment clock", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  try {
    const first = await startLogin("anthropic");
    await vi.advanceTimersByTimeAsync(LOGIN_TIMEOUT_MS - 2_000);
    const again = await startLogin("anthropic");
    expect(again).toBe(first);

    await vi.advanceTimersByTimeAsync(4_000);
    let row = (await getAuthStatus()).providers.find(
      (p) => p.provider === "anthropic",
    );
    expect(row?.login?.status).toBe("awaiting_user");

    await vi.advanceTimersByTimeAsync(LOGIN_TIMEOUT_MS);
    row = (await getAuthStatus()).providers.find(
      (p) => p.provider === "anthropic",
    );
    expect(row?.login?.status).toBe("error");
    expect(row?.login?.error).toBe(LOGIN_TIMEOUT_ERROR);
  } finally {
    vi.useRealTimers();
  }
});

const NO_ACCESS_403 =
  '403 Forbidden: {"error_details":{"message":"No access to GitHub Copilot found. You are currently logged in as octocat.","notification_id":"no_copilot_access","title":"Sign up for GitHub Copilot","url":"https://github.com/github-copilot/signup?editor={EDITOR}"},"message":"Resource not accessible by integration","can_signup_for_limited":true}';

test("loginFailureMessage: copilot no_copilot_access collapses to the friendly sentinel, everything else passes through", () => {
  expect(loginFailureMessage("github-copilot", NO_ACCESS_403)).toBe(
    COPILOT_NO_ACCESS_ERROR,
  );
  expect(
    loginFailureMessage("github-copilot", "Device flow failed: expired_token"),
  ).toBe("Device flow failed: expired_token");
  expect(loginFailureMessage("openai-codex", NO_ACCESS_403)).toBe(
    NO_ACCESS_403,
  );
});

test("github-copilot: a no-Copilot-subscription 403 surfaces the sentinel in auth status, never the raw GitHub body", async () => {
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  const piLogin = stubPiLogin((interaction) => {
    interaction.notify({
      type: "device_code",
      userCode: "ABCD-1234",
      verificationUri: "https://github.com/login/device",
    });
    return Promise.reject(new Error(NO_ACCESS_403));
  });
  try {
    const info = await startLogin("github-copilot", true);
    expect(info.kind).toBe("device_code");
    await new Promise((r) => setTimeout(r, 20));
    const row = (await getAuthStatus()).providers.find(
      (p) => p.provider === "github-copilot",
    );
    expect(row?.login?.status).toBe("error");
    expect(row?.login?.error).toBe(COPILOT_NO_ACCESS_ERROR);

    const logged = (calls: unknown[][]) =>
      calls.map((args) => args.join(" ")).join("\n");
    expect(logged(warnSpy.mock.calls)).toContain("no_copilot_access");
    expect(logged(errorSpy.mock.calls)).not.toContain("no_copilot_access");
    expect(logged(warnSpy.mock.calls)).not.toContain("octocat");
  } finally {
    piLogin.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
    cancelLogin("github-copilot");
  }
});

test("a cancelled login's expiry never resurrects an error row", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  try {
    await startLogin("anthropic");
    cancelLogin("anthropic");
    await vi.advanceTimersByTimeAsync(LOGIN_TIMEOUT_MS + 1);
    const row = (await getAuthStatus()).providers.find(
      (p) => p.provider === "anthropic",
    );
    expect(row?.login).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});
