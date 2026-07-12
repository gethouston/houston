import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { Capabilities } from "@houston-ai/engine-client";
import {
  apiKeysSupported,
  isKeyGoneError,
  isKeyLimitError,
  isValidKeyName,
  lastUsedState,
  MAX_KEY_NAME_LENGTH,
} from "../src/lib/api-keys-model.ts";

const caps = (over: Partial<Capabilities>): Capabilities =>
  ({
    profile: "cloud",
    revealInOs: false,
    terminal: false,
    tunnel: false,
    codeExecution: "remote-sandbox",
    providers: [],
    openaiCompatible: false,
    integrations: [],
    ...over,
  }) as Capabilities;

describe("apiKeysSupported", () => {
  it("is true only when the capability flag is exactly true", () => {
    strictEqual(apiKeysSupported(caps({ apiKeys: true })), true);
    strictEqual(apiKeysSupported(caps({ apiKeys: false })), false);
    strictEqual(apiKeysSupported(caps({})), false);
    strictEqual(apiKeysSupported(null), false);
  });
});

describe("isValidKeyName", () => {
  it("requires 1..100 chars after trimming", () => {
    strictEqual(isValidKeyName("My key"), true);
    strictEqual(isValidKeyName("  padded  "), true);
    strictEqual(isValidKeyName(""), false);
    strictEqual(isValidKeyName("   "), false);
    strictEqual(isValidKeyName("a".repeat(MAX_KEY_NAME_LENGTH)), true);
    strictEqual(isValidKeyName("a".repeat(MAX_KEY_NAME_LENGTH + 1)), false);
  });
});

describe("isKeyLimitError", () => {
  it("matches only a 400 with a top-level key_limit code", () => {
    strictEqual(
      isKeyLimitError({ status: 400, body: { code: "key_limit" } }),
      true,
    );
  });
  it("rejects other statuses, codes, and shapes", () => {
    strictEqual(
      isKeyLimitError({ status: 500, body: { code: "key_limit" } }),
      false,
    );
    strictEqual(
      isKeyLimitError({ status: 400, body: { code: "other" } }),
      false,
    );
    // The engine-client nests reasons under error.code; a flat key_limit must
    // NOT be found there, and a nested one must NOT match (it is not top-level).
    strictEqual(
      isKeyLimitError({ status: 400, body: { error: { code: "key_limit" } } }),
      false,
    );
    strictEqual(isKeyLimitError({ status: 400 }), false);
    strictEqual(isKeyLimitError(null), false);
    strictEqual(isKeyLimitError(new Error("boom")), false);
  });
});

describe("isKeyGoneError", () => {
  it("matches a 404 (revoke of an already-gone key)", () => {
    strictEqual(isKeyGoneError({ status: 404 }), true);
    strictEqual(
      isKeyGoneError({ status: 404, body: { code: "not_found" } }),
      true,
    );
  });
  it("rejects other statuses and shapes", () => {
    strictEqual(isKeyGoneError({ status: 400 }), false);
    strictEqual(isKeyGoneError({ status: 500 }), false);
    strictEqual(isKeyGoneError(null), false);
    strictEqual(isKeyGoneError(undefined), false);
    strictEqual(isKeyGoneError(new Error("boom")), false);
  });
});

describe("lastUsedState", () => {
  it("reports never for an absent or unparseable timestamp", () => {
    strictEqual(lastUsedState({}).kind, "never");
    strictEqual(lastUsedState({ lastUsedAt: undefined }).kind, "never");
    strictEqual(lastUsedState({ lastUsedAt: "not-a-date" }).kind, "never");
  });
  it("reports the parsed instant for a valid timestamp", () => {
    const iso = "2026-07-01T12:00:00.000Z";
    const state = lastUsedState({ lastUsedAt: iso });
    strictEqual(state.kind, "at");
    if (state.kind === "at") strictEqual(state.atMs, Date.parse(iso));
  });
});
