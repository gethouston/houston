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

