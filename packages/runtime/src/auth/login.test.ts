import {
  OPENAI_CODEX_BROWSER_LOGIN_METHOD,
  OPENAI_CODEX_DEVICE_CODE_LOGIN_METHOD,
} from "@earendil-works/pi-ai/oauth";
import { expect, test } from "vitest";
import {
  autoPromptAnswer,
  cancelLogin,
  codexLoginMethod,
  getAuthStatus,
  LOCAL_PLACEHOLDER_KEY,
  setApiKey,
  startLogin,
} from "./login";

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
