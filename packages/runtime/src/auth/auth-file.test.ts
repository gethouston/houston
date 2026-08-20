import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import {
  applyServedCredential,
  readAuthFile,
  scrubRefreshTokenAt,
  writeAuthFile,
} from "./auth-file";

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

test("applyServedCredential does not clobber a refresh-bearing login", () => {
  const path = scratch();
  const pending = {
    type: "oauth" as const,
    access: "fresh-access",
    refresh: "fresh-refresh",
    expires: Date.now() + 600_000,
  };
  writeAuthFile(path, { "openai-codex": pending });

  expect(
    applyServedCredential(path, {
      provider: "openai-codex",
      access: "old-central-access",
      expires: Date.now() + 300_000,
      accountId: null,
    }),
  ).toBe(false);
  expect(readAuthFile(path)["openai-codex"]).toEqual(pending);
  rmSync(path, { force: true });
});

test("scrubRefreshTokenAt no-ops on an api_key entry (nothing to scrub)", () => {
  // The capture flow's post-PUT scrub is OAuth-only; an api_key (the pasted
  // Anthropic setup token, PRODUCT-1370) has no refresh token to strip and the
  // entry must survive capture untouched — on the desktop the serve path never
  // re-supplies anthropic, so removing it would disconnect the provider the
  // user just connected.
  const path = scratch();
  const pasted = { type: "api_key" as const, key: "sk-ant-oat01-setup" };
  writeAuthFile(path, { anthropic: pasted });
  expect(scrubRefreshTokenAt(path, "anthropic")).toBe(false);
  expect(readAuthFile(path).anthropic).toEqual(pasted);
  rmSync(path, { force: true });
});
