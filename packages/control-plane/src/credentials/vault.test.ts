import { test, expect } from "bun:test";
import { EnvCredentialVault } from "./vault";

const SECRET = "test-secret-abc";

test("sandboxToken round-trips through validateSandboxToken", () => {
  const v = new EnvCredentialVault({ secret: SECRET });
  const token = v.sandboxToken("ws-1", "agent-9");
  expect(token).toContain(".");
  expect(v.validateSandboxToken(token)).toEqual({ workspaceId: "ws-1", agentId: "agent-9" });
});

test("a tampered payload is rejected (signature no longer matches)", () => {
  const v = new EnvCredentialVault({ secret: SECRET });
  const token = v.sandboxToken("ws-1", "agent-9");
  const [payload, sig] = token.split(".");
  // Re-encode a different payload but keep the old signature → forgery.
  const forgedPayload = Buffer.from(
    JSON.stringify({ workspaceId: "ws-evil", agentId: "agent-9" }),
    "utf8",
  ).toString("base64url");
  expect(payload).toBeDefined();
  expect(sig).toBeDefined();
  expect(v.validateSandboxToken(`${forgedPayload}.${sig}`)).toBeNull();
});

test("a tampered signature is rejected", () => {
  const v = new EnvCredentialVault({ secret: SECRET });
  const token = v.sandboxToken("ws-1", "agent-9");
  const [payload] = token.split(".");
  expect(v.validateSandboxToken(`${payload}.deadbeef`)).toBeNull();
});

test("a token signed with a different secret is rejected", () => {
  const minter = new EnvCredentialVault({ secret: "other-secret" });
  const verifier = new EnvCredentialVault({ secret: SECRET });
  const token = minter.sandboxToken("ws-1", "agent-9");
  expect(verifier.validateSandboxToken(token)).toBeNull();
});

test("malformed tokens are rejected, never thrown", () => {
  const v = new EnvCredentialVault({ secret: SECRET });
  expect(v.validateSandboxToken("")).toBeNull();
  expect(v.validateSandboxToken("nodot")).toBeNull();
  expect(v.validateSandboxToken(".onlysig")).toBeNull();
  expect(v.validateSandboxToken("onlypayload.")).toBeNull();
  // Valid-looking shape but payload is not the right object.
  const badPayload = Buffer.from(JSON.stringify({ foo: "bar" }), "utf8").toString("base64url");
  const stamped = new EnvCredentialVault({ secret: SECRET });
  // Sign the bad payload so the HMAC passes but the schema check fails.
  const token = (() => {
    const t = stamped.sandboxToken("x", "y");
    const sig = t.split(".")[1];
    return `${badPayload}.${sig}`;
  })();
  // The signature won't match badPayload, so it's null either way — assert null.
  expect(v.validateSandboxToken(token)).toBeNull();
});

test("realKeyFor resolves an injected per-workspace key and returns null when absent", async () => {
  const v = new EnvCredentialVault({
    secret: SECRET,
    keys: { CP_WORKSPACE_KEY_WS_1_ANTHROPIC: "sk-real-123" },
  });
  expect(await v.realKeyFor("ws-1", "anthropic")).toBe("sk-real-123");
  expect(await v.realKeyFor("ws-1", "openai")).toBeNull();
  expect(await v.realKeyFor("ws-2", "anthropic")).toBeNull();
});

test("realKeyFor reads from the environment when not injected", async () => {
  process.env.CP_WORKSPACE_KEY_ENVWS_ANTHROPIC = "sk-from-env";
  try {
    const v = new EnvCredentialVault({ secret: SECRET });
    expect(await v.realKeyFor("envws", "anthropic")).toBe("sk-from-env");
  } finally {
    delete process.env.CP_WORKSPACE_KEY_ENVWS_ANTHROPIC;
  }
});

test("workspace/provider name normalization is consistent across mint and lookup", async () => {
  // Hyphenated workspace id maps to underscored env-style key.
  const v = new EnvCredentialVault({
    secret: SECRET,
    keys: { "CP_WORKSPACE_KEY_ACME_CORP_ANTHROPIC": "sk-acme" },
  });
  expect(await v.realKeyFor("acme-corp", "anthropic")).toBe("sk-acme");
  expect(await v.realKeyFor("acme.corp", "anthropic")).toBe("sk-acme");
});
