import { afterEach, expect, test, vi } from "vitest";
import type { CredentialVault } from "../ports";
import { assistantClaim } from "./assistant-claim";

const vault: CredentialVault = {
  sandboxToken: () => "token",
  validateSandboxToken: (agentId) => ({ workspaceId: "w", agentId }),
};
afterEach(() => vi.unstubAllEnvs());
test.each([
  "w/Assistant",
  "w/.assistant",
])("fronted host requires assistant pod identity for %s", (id) => {
  vi.stubEnv("HOUSTON_ASSISTANT_USER_ID", "");
  expect(assistantClaim(vault, id, { gatewayFronted: true })).toBeNull();
  vi.stubEnv("HOUSTON_ASSISTANT_USER_ID", "owner");
  expect(assistantClaim(vault, id, { gatewayFronted: true })?.agentId).toBe(id);
});
test("local host retains the dot-agent identity check", () => {
  vi.stubEnv("HOUSTON_ASSISTANT_USER_ID", "owner");
  expect(assistantClaim(vault, "w/Writer")).toBeNull();
  expect(assistantClaim(vault, "w/.assistant")?.agentId).toBe("w/.assistant");
});
