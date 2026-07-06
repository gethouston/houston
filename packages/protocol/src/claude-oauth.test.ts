import { describe, expect, test } from "vitest";
import { parseClaudeOAuthEnvelope } from "./claude-oauth";

const valid = {
  claudeAiOauth: {
    accessToken: "sk-ant-oat-access",
    refreshToken: "sk-ant-ort-refresh",
    expiresAt: 1_800_000_000_000,
    scopes: ["user:inference", "user:profile"],
    subscriptionType: "max",
  },
};

describe("parseClaudeOAuthEnvelope", () => {
  test("accepts the pinned CLI envelope and returns a field-exact credential", () => {
    const r = parseClaudeOAuthEnvelope(valid);
    expect(r.ok).toBe(true);
    if (r.ok)
      expect(r.value).toEqual({
        accessToken: "sk-ant-oat-access",
        refreshToken: "sk-ant-ort-refresh",
        expiresAt: 1_800_000_000_000,
        scopes: ["user:inference", "user:profile"],
        subscriptionType: "max",
      });
  });

  test("subscriptionType is optional", () => {
    const { subscriptionType: _drop, ...rest } = valid.claudeAiOauth;
    const r = parseClaudeOAuthEnvelope({ claudeAiOauth: rest });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.subscriptionType).toBeUndefined();
  });

  test("drops unknown extra fields (no coercion / passthrough)", () => {
    const r = parseClaudeOAuthEnvelope({
      claudeAiOauth: { ...valid.claudeAiOauth, sneaky: "x" },
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect("sneaky" in r.value).toBe(false);
  });

  test.each([
    ["non-object body", 42],
    ["null body", null],
    ["missing envelope", {}],
    ["envelope not an object", { claudeAiOauth: "nope" }],
    [
      "empty accessToken",
      { claudeAiOauth: { ...valid.claudeAiOauth, accessToken: "" } },
    ],
    [
      "refreshToken wrong type",
      { claudeAiOauth: { ...valid.claudeAiOauth, refreshToken: 7 } },
    ],
    [
      "expiresAt not a number",
      { claudeAiOauth: { ...valid.claudeAiOauth, expiresAt: "soon" } },
    ],
    [
      "scopes not an array",
      { claudeAiOauth: { ...valid.claudeAiOauth, scopes: "user" } },
    ],
    [
      "scopes has a non-string",
      { claudeAiOauth: { ...valid.claudeAiOauth, scopes: ["ok", 3] } },
    ],
    [
      "subscriptionType wrong type",
      { claudeAiOauth: { ...valid.claudeAiOauth, subscriptionType: 5 } },
    ],
  ])("rejects %s with a clear error", (_label, body) => {
    const r = parseClaudeOAuthEnvelope(body);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBeTruthy();
  });

  // The ONE hard requirement is accessToken; a real minted credential must never
  // be rejected over an absent optional field (that would strand every user on
  // the paste fallback). Absent optionals are omitted, not defaulted.
  test.each([
    ["missing refreshToken", "refreshToken"],
    ["missing expiresAt", "expiresAt"],
    ["missing scopes", "scopes"],
  ])("accepts a credential %s (optional), omitting it", (_label, field) => {
    const inner: Record<string, unknown> = { ...valid.claudeAiOauth };
    delete inner[field];
    const r = parseClaudeOAuthEnvelope({ claudeAiOauth: inner });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.accessToken).toBe(valid.claudeAiOauth.accessToken);
      expect(field in r.value).toBe(false);
    }
  });

  test("accepts expiresAt: 0 (the SDK, not Houston, interprets expiry)", () => {
    const r = parseClaudeOAuthEnvelope({
      claudeAiOauth: { ...valid.claudeAiOauth, expiresAt: 0 },
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.expiresAt).toBe(0);
  });
});
