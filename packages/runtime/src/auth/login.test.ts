import {
  OPENAI_CODEX_BROWSER_LOGIN_METHOD,
  OPENAI_CODEX_DEVICE_CODE_LOGIN_METHOD,
} from "@earendil-works/pi-ai/oauth";
import { expect, test } from "vitest";
import {
  autoPromptAnswer,
  codexLoginMethod,
  LOCAL_PLACEHOLDER_KEY,
  setApiKey,
  startLogin,
} from "./login";

test("codexLoginMethod: browser login only for a co-located client on a loopback runtime", () => {
  // The desktop app sends deviceAuth:false and the desktop runtime is non-headless:
  // the user approves in their own browser and the localhost callback finishes it.
  expect(codexLoginMethod({ deviceAuth: false, headless: false })).toBe(
    OPENAI_CODEX_BROWSER_LOGIN_METHOD,
  );
});

test("codexLoginMethod: device code for any remote client (deviceAuth) — cloud and self-host", () => {
  // A remote webapp (cloud OR self-host) sends deviceAuth:true: the user types a
  // one-time code while the runtime polls, regardless of how the runtime binds.
  expect(codexLoginMethod({ deviceAuth: true, headless: false })).toBe(
    OPENAI_CODEX_DEVICE_CODE_LOGIN_METHOD,
  );
  expect(codexLoginMethod({ deviceAuth: true, headless: true })).toBe(
    OPENAI_CODEX_DEVICE_CODE_LOGIN_METHOD,
  );
});

test("codexLoginMethod: device code when a co-located client hits a headless runtime", () => {
  // Exotic: desktop pointed at a remote headless runtime. The loopback can't be
  // reached, so fall back to the device code even though deviceAuth is false.
  expect(codexLoginMethod({ deviceAuth: false, headless: true })).toBe(
    OPENAI_CODEX_DEVICE_CODE_LOGIN_METHOD,
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
  // Every other provider's onPrompt is the Anthropic headless code paste, which
  // MUST wait for the user — null tells startLogin to hand back the paste promise.
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

test("LOCAL_PLACEHOLDER_KEY exists for keyless local servers", () => {
  // Ollama/LM Studio ignore the Authorization header, but pi requires SOME key,
  // so a blank key becomes this placeholder.
  expect(LOCAL_PLACEHOLDER_KEY.length).toBeGreaterThan(0);
});
