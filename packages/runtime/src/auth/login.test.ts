import { expect, test } from "bun:test";
import {
  OPENAI_CODEX_BROWSER_LOGIN_METHOD,
  OPENAI_CODEX_DEVICE_CODE_LOGIN_METHOD,
} from "@earendil-works/pi-ai/oauth";
import { codexLoginMethod, setApiKey, startLogin } from "./login";

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

// --- setApiKey validation + the oauth/api-key separation ---
// These all reject BEFORE touching the credential store, so they never write.

test("setApiKey rejects an unknown provider", () => {
  expect(() => setApiKey("nope", "sk-or-v1-abcdefgh")).toThrow(
    /unknown provider/,
  );
});

test("setApiKey rejects an OAuth provider — those connect via sign-in, not a key", () => {
  expect(() => setApiKey("anthropic", "x".repeat(40))).toThrow(/OAuth/);
  expect(() => setApiKey("openai-codex", "x".repeat(40))).toThrow(/OAuth/);
});

test("setApiKey rejects an empty, whitespace-laden, or too-short key", () => {
  expect(() => setApiKey("openrouter", "   ")).toThrow(/empty/);
  expect(() => setApiKey("openrouter", "ab cd ef gh")).toThrow(/whitespace/);
  expect(() => setApiKey("google", "short")).toThrow(/length/);
});

test("startLogin rejects an api-key provider — it has no OAuth flow", async () => {
  await expect(startLogin("openrouter")).rejects.toThrow(/API key/);
  await expect(startLogin("google")).rejects.toThrow(/API key/);
});
