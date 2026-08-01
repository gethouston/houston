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
  // The legacy family behind HOUSTON-APP-4Y9: pre-verification pastes stored
  // OAuth material as google "API keys".
  expect(servedApiKeyIsDead(served({ access: "ya29.a0AfH6SMBx" }))).toBe(true);
  expect(
    servedApiKeyIsDead(served({ access: "eyJhbGciOiJSUzI1NiJ9.x.y" })),
  ).toBe(true);
  expect(servedApiKeyIsDead(served({ access: "aa" }))).toBe(true);
});

test("a real Gemini key (AIza…) is never refused", () => {
  expect(servedApiKeyIsDead(served({}))).toBe(false);
});

test("the guard is google-only and api_key-only", () => {
  // Other providers' key shapes are not this crisp — never judge them here.
  expect(
    servedApiKeyIsDead(served({ provider: "openrouter", access: "ya29.x" })),
  ).toBe(false);
  // A google oauth serve is a different (already-guarded) story: pi resolves
  // it to no-auth, and the store cannot serve one past its expiry.
  expect(servedApiKeyIsDead(served({ kind: "oauth", access: "ya29.x" }))).toBe(
    false,
  );
  // A pre-kind wire (kind absent) is written as oauth, not api_key.
  expect(
    servedApiKeyIsDead(served({ kind: undefined, access: "ya29.x" })),
  ).toBe(false);
});
