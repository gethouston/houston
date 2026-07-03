import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { applyServedCredential, readAuthFile } from "./auth-file";

/**
 * The connect-once serve path writes the host's served credential into the
 * runtime's auth.json (access-token-only, refresh scrubbed — Gate #2). For
 * GitHub Copilot Enterprise the served credential ALSO carries `enterpriseUrl`
 * (the company GitHub domain) so pi's modifyModels points the model at the
 * enterprise API base URL. This pins that the field round-trips, and that it is
 * omitted for individual Copilot.
 */

function scratch(): string {
  return join(mkdtempSync(join(tmpdir(), "houston-authfile-")), "auth.json");
}

test("applyServedCredential carries the Copilot Enterprise domain into auth.json", () => {
  const path = scratch();
  applyServedCredential(path, {
    provider: "github-copilot",
    access: "tid=company",
    expires: Date.now() + 600_000,
    accountId: null,
    kind: "oauth",
    enterpriseUrl: "acme.ghe.com",
  });
  const cred = readAuthFile(path)["github-copilot"];
  rmSync(path, { force: true });
  expect(cred?.type).toBe("oauth");
  if (cred?.type === "oauth") {
    expect(cred.enterpriseUrl).toBe("acme.ghe.com");
    // Gate #2: the refresh token is never written to the runtime.
    expect(cred.refresh).toBe("");
  }
});

test("applyServedCredential omits enterpriseUrl for individual Copilot", () => {
  const path = scratch();
  applyServedCredential(path, {
    provider: "github-copilot",
    access: "tid=personal",
    expires: Date.now() + 600_000,
    accountId: null,
    kind: "oauth",
  });
  const cred = readAuthFile(path)["github-copilot"];
  rmSync(path, { force: true });
  expect(cred?.type).toBe("oauth");
  if (cred?.type === "oauth") {
    expect(cred.enterpriseUrl).toBeUndefined();
  }
});

/**
 * OpenCode Zen (`opencode`) and OpenCode Go (`opencode-go`) authenticate with the
 * same opencode.ai key. A credential served for either gateway must materialize
 * an auth.json entry for BOTH, so the gateway it wasn't served under still reads
 * as connected (pi's `has()`) and its turns authenticate (pi's `getApiKey()`) —
 * otherwise it surfaces a spurious "sign in again" card.
 */
test("applyServedCredential mirrors an OpenCode key onto its sibling gateway", () => {
  const path = scratch();
  applyServedCredential(path, {
    provider: "opencode",
    access: "sk-zen",
    expires: 0,
    accountId: null,
    kind: "api_key",
  });
  const auth = readAuthFile(path);
  rmSync(path, { force: true });
  for (const id of ["opencode", "opencode-go"]) {
    const cred = auth[id];
    expect(cred?.type).toBe("api_key");
    if (cred?.type === "api_key") expect(cred.key).toBe("sk-zen");
  }
});

test("applyServedCredential mirrors symmetrically from opencode-go to opencode", () => {
  const path = scratch();
  applyServedCredential(path, {
    provider: "opencode-go",
    access: "sk-go",
    expires: 0,
    accountId: null,
    kind: "api_key",
  });
  const opencode = readAuthFile(path).opencode;
  rmSync(path, { force: true });
  expect(opencode?.type).toBe("api_key");
  if (opencode?.type === "api_key") expect(opencode.key).toBe("sk-go");
});

test("applyServedCredential does not mirror a provider with no shared credential", () => {
  const path = scratch();
  applyServedCredential(path, {
    provider: "openrouter",
    access: "sk-or",
    expires: 0,
    accountId: null,
    kind: "api_key",
  });
  const auth = readAuthFile(path);
  rmSync(path, { force: true });
  expect(Object.keys(auth)).toEqual(["openrouter"]);
});
