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
