import { createServer, type Server } from "node:net";
import {
  OPENAI_CODEX_BROWSER_LOGIN_METHOD,
  OPENAI_CODEX_DEVICE_CODE_LOGIN_METHOD,
} from "@earendil-works/pi-ai/oauth";
import { expect, test, vi } from "vitest";
import {
  CODEX_OAUTH_CALLBACK_PORT,
  CodexCallbackPortInUseError,
} from "./codex-port-preflight";
import {
  autoPromptAnswer,
  cancelLogin,
  codexLoginMethod,
  getAuthStatus,
  LOCAL_PLACEHOLDER_KEY,
  LOGIN_TIMEOUT_ERROR,
  LOGIN_TIMEOUT_MS,
  setApiKey,
  startLogin,
} from "./login";
import { authStorage } from "./storage";

/** Occupy the fixed Codex callback port, like a running Codex CLI would. */
function occupyCodexCallbackPort(): Promise<Server> {
  return new Promise<Server>((resolve, reject) => {
    const s = createServer();
    s.once("error", reject);
    s.listen(CODEX_OAUTH_CALLBACK_PORT, "127.0.0.1", () => resolve(s));
  });
}

/**
 * Stub pi's AuthStorage.login so no real OAuth/network runs: it resolves the
 * `info` (via onAuth) so startLogin returns, then hangs until cancelLogin tears
 * it down. The mock being CALLED is the signal that startLogin got past the
 * port preflight.
 */
function stubPiLogin() {
  return vi
    .spyOn(authStorage, "login")
    .mockImplementation((_provider, opts) => {
      opts.onAuth({ url: "https://auth.example/codex" });
      return new Promise<void>(() => {});
    });
}

test("openai-codex browser login preflights the callback port and fails fast when it is busy (no pi call, slot free)", async () => {
  // A real Codex CLI holding 1455 used to leave the user on a 5-min spinner:
  // pi swallows the bind error. The preflight turns it into an instant,
  // actionable error BEFORE pi is even invoked, and never wedges the slot.
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
    // Short-circuited BEFORE handing off to pi.
    expect(piLogin).not.toHaveBeenCalled();
    // No state was added, so the slot is free for an immediate retry.
    expect(
      (await getAuthStatus()).providers.find(
        (p) => p.provider === "openai-codex",
      )?.login,
    ).toBeNull();

    // Release the port; the retry now proceeds PAST the preflight into pi.
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

test("openai-codex device-code login does NOT preflight the callback port", async () => {
  // The device-code flow (deviceAuth:true) binds no loopback server, so a
  // squatter on 1455 must not block it: it goes straight to pi.
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
  // The desktop app sends deviceAuth:false: the user approves in their own
  // browser, the client catches the fixed localhost:1455 redirect and relays
  // code+state, and the runtime finishes the token exchange.
  expect(codexLoginMethod({ deviceAuth: false })).toBe(
    OPENAI_CODEX_BROWSER_LOGIN_METHOD,
  );
});

test("codexLoginMethod: device code for any remote client (deviceAuth) — cloud and self-host", () => {
  // A remote webapp (cloud OR self-host) sends deviceAuth:true: the user types a
  // one-time code while the runtime polls.
  expect(codexLoginMethod({ deviceAuth: true })).toBe(
    OPENAI_CODEX_DEVICE_CODE_LOGIN_METHOD,
  );
});

test("codexLoginMethod: browser login for a headless/remote runtime whose client relays the callback", () => {
  // Cloud-relay scenario: the runtime is headless but the desktop client still
  // catches http://localhost:1455/auth/callback and relays code+state via
  // completeLogin. The browser flow races its local callback server against that
  // manually-relayed code, so headless no longer forces the device code — only
  // deviceAuth decides, and deviceAuth:false means the client CAN relay.
  expect(codexLoginMethod({ deviceAuth: false })).toBe(
    OPENAI_CODEX_BROWSER_LOGIN_METHOD,
  );
});

test("autoPromptAnswer: github-copilot auto-answers the enterprise-domain prompt", () => {
  // pi-ai's Copilot login OPENS with an optional "GitHub Enterprise URL/domain"
  // question before emitting the device code; leaving it unanswered deadlocks
  // the flow. With no domain (individual Copilot) we answer "" => github.com
  // (and never surface enterprise jargon to a non-technical user).
  expect(autoPromptAnswer("github-copilot")).toBe("");
});

test("autoPromptAnswer: github-copilot forwards the Enterprise company domain", () => {
  // Copilot Enterprise: the domain the user typed on the Enterprise card becomes
  // the prompt answer, so pi-ai runs the device-code flow against the company's
  // GitHub instead of github.com. The empty answer above is the individual case.
  expect(autoPromptAnswer("github-copilot", "acme.ghe.com")).toBe(
    "acme.ghe.com",
  );
  // A domain is meaningless for any other provider (their onPrompt is the paste).
  expect(autoPromptAnswer("anthropic", "acme.ghe.com")).toBeNull();
});

test("autoPromptAnswer: other providers defer to the user (null => paste promise)", () => {
  // Every other provider's onPrompt is a manual code paste, which MUST wait for
  // the user — null tells startLogin to hand back the paste promise.
  expect(autoPromptAnswer("anthropic")).toBeNull();
  expect(autoPromptAnswer("openai-codex")).toBeNull();
});

test("the OpenAI-compatible provider rejects the OAuth and api-key connect paths", async () => {
  // It connects via its own /providers/openai-compatible route (base URL +
  // model), so the OAuth and pasted-key paths must turn it away rather than
  // start a sign-in pi has no provider for.
  await expect(startLogin("openai-compatible")).rejects.toThrow(/OAuth/);
  expect(() => setApiKey("openai-compatible", "k")).toThrow(/API key/);
});

test("setApiKey rejects an OAuth provider and an id pi-ai doesn't know", () => {
  // An OAuth pi provider (curated OR uncurated) must NOT accept a pasted key —
  // it connects via startLogin, so setApiKey turns it away with a clear reason.
  expect(() => setApiKey("openai-codex", "sk-x")).toThrow(/API key/);
  expect(() => setApiKey("anthropic", "sk-x")).toThrow(/API key/);
  // An id pi-ai has never heard of isn't a provider at all: rejected up front so
  // a typo can't silently persist a dead credential.
  expect(() => setApiKey("not-a-real-provider", "sk-x")).toThrow(
    /unknown provider/,
  );
});

test("cancelLogin: benign with nothing in flight, throws on an unknown provider", () => {
  // The client fires cancel on dialog dismiss regardless of flow state, so a
  // no-op cancel must never error; a typo'd provider id is a caller bug.
  expect(() => cancelLogin("anthropic")).not.toThrow();
  expect(() => cancelLogin("not-a-provider")).toThrow(/unknown provider/);
});

test("cancelLogin: tears down the in-flight flow so a retry starts clean (HOU-664)", async () => {
  // Anthropic now uses the sanctioned setup-token paste flow (`auth_code`, no
  // loopback server). Independent of the flow shape, the old cosmetic cancel
  // left the flow alive and the slot pending, so a retry collided with the
  // stale login (the HOU-438 failure class). A real cancel frees the slot
  // immediately so a retry builds a fresh login.
  const first = await startLogin("anthropic");
  expect(first.kind).toBe("auth_code");
  expect(
    (await getAuthStatus()).providers.find((p) => p.provider === "anthropic")
      ?.login?.status,
  ).toBe("awaiting_user");

  cancelLogin("anthropic");

  // Slot freed at once: status no longer reports a pending login.
  expect(
    (await getAuthStatus()).providers.find((p) => p.provider === "anthropic")
      ?.login,
  ).toBeNull();

  // Let the rejected paste promise unwind the flow...
  await new Promise((r) => setTimeout(r, 100));
  // ...then a retry yields a FRESH login (idempotent reuse of a live login
  // returns the same info object; a fresh start builds a new one).
  const second = await startLogin("anthropic");
  expect(second.kind).toBe("auth_code");
  expect(second).not.toBe(first);
  cancelLogin("anthropic");
  await new Promise((r) => setTimeout(r, 100));
});

test("LOCAL_PLACEHOLDER_KEY exists for keyless local servers", () => {
  // Ollama/LM Studio ignore the Authorization header, but pi requires SOME key,
  // so a blank key becomes this placeholder.
  expect(LOCAL_PLACEHOLDER_KEY.length).toBeGreaterThan(0);
});

test("an abandoned login expires: reports 'Login timed out' and frees the flow for a retry", async () => {
  // An abandoned flow held pi's OAuth callback server bound to the provider's
  // fixed port (Codex: 1455) FOREVER, blocking every future sign-in for that
  // provider machine-wide. The expiry tears the flow down like cancelLogin but
  // records the attempt as a failure so status polls surface it.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  try {
    const first = await startLogin("anthropic");
    expect(first.kind).toBe("auth_code");

    await vi.advanceTimersByTimeAsync(LOGIN_TIMEOUT_MS + 1);

    const row = (await getAuthStatus()).providers.find(
      (p) => p.provider === "anthropic",
    );
    expect(row?.login?.status).toBe("error");
    expect(row?.login?.error).toBe(LOGIN_TIMEOUT_ERROR);

    // The paste promise was rejected (flow unwound, port freed), so a retry
    // builds a FRESH login instead of reusing the dead one.
    const second = await startLogin("anthropic");
    expect(second).not.toBe(first);
    cancelLogin("anthropic");
    await vi.advanceTimersByTimeAsync(100);
  } finally {
    vi.useRealTimers();
  }
});

test("reusing an in-flight login re-arms the abandonment clock", async () => {
  // A second connect click near the deadline idempotently reuses the live flow
  // — the user just asked to sign in, so they get the FULL window again, not
  // the stale remainder of the first click's.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  try {
    const first = await startLogin("anthropic");
    await vi.advanceTimersByTimeAsync(LOGIN_TIMEOUT_MS - 2_000);
    const again = await startLogin("anthropic");
    expect(again).toBe(first);

    // Crossing the ORIGINAL deadline must not kill the refreshed flow…
    await vi.advanceTimersByTimeAsync(4_000);
    let row = (await getAuthStatus()).providers.find(
      (p) => p.provider === "anthropic",
    );
    expect(row?.login?.status).toBe("awaiting_user");

    // …but the refreshed window still expires on its own schedule.
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

test("a cancelled login's expiry never resurrects an error row", async () => {
  // Cancel frees the slot (login: null). The expiry firing later must stand
  // down — not overwrite the clean slate with a phantom timeout error.
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
