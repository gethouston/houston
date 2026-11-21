import { expect, test } from "vitest";
import type { ServedCredential } from "./auth-file";
import { servedApiKeyIsDead } from "./served-key-guard";

const served = (over: Partial<ServedCredential>): ServedCredential => ({
  provider: "google",
  access: "AIzaSyExample-Key",
  expires: Number.MAX_SAFE_INTEGER,
  accountId: null,
  kind: "api_key",
  ...over,
});

test("a google api_key that is an OAuth access token reads dead", () => {
  expect(servedApiKeyIsDead(served({ access: "ya29.a0AfH6SMBx" }))).toBe(true);
  expect(
    servedApiKeyIsDead(served({ access: "eyJhbGciOiJSUzI1NiJ9.x.y" })),
  ).toBe(true);
});

test("a real Gemini key is never refused, whatever its format", () => {
  expect(servedApiKeyIsDead(served({}))).toBe(false);
  expect(
    servedApiKeyIsDead(served({ access: "AQ.Ab8RN6JkyDLMExampleAuthKey" })),
  ).toBe(false);
  expect(servedApiKeyIsDead(served({ access: "aa" }))).toBe(false);
});

test("the guard is google-only and api_key-only", () => {
  expect(
    servedApiKeyIsDead(served({ provider: "openrouter", access: "ya29.x" })),
  ).toBe(false);
  expect(servedApiKeyIsDead(served({ kind: "oauth", access: "ya29.x" }))).toBe(
    false,
  );
  expect(
    servedApiKeyIsDead(served({ kind: undefined, access: "ya29.x" })),
  ).toBe(false);
});
