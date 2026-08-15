import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import {
  isAnthropicToken,
  runAnthropicSetupTokenLogin,
  storeAnthropicToken,
} from "./anthropic-setup-token";
import { type PiCred, scrubRefreshTokenAt } from "./auth-file";

test("isAnthropicToken accepts setup tokens and console keys, rejects junk", () => {
  expect(isAnthropicToken("sk-ant-oat01-abc123")).toBe(true); // setup token
  expect(isAnthropicToken("  sk-ant-api03-xyz  ")).toBe(true); // console API key
  expect(isAnthropicToken("sk-ant-oatXX")).toBe(false); // wrong prefix
  expect(isAnthropicToken("hello")).toBe(false);
  expect(isAnthropicToken("")).toBe(false);
});

test("storeAnthropicToken stores a valid token (trimmed) and rejects junk", () => {
  const oat: string[] = [];
  storeAnthropicToken("  sk-ant-oat01-good  ", (k) => oat.push(k));
  expect(oat).toEqual(["sk-ant-oat01-good"]); // setup token, trimmed + persisted

  const api: string[] = [];
  storeAnthropicToken("sk-ant-api03-key", (k) => api.push(k));
  expect(api).toEqual(["sk-ant-api03-key"]); // console API key also accepted

  expect(() => storeAnthropicToken("not-a-token", () => {})).toThrow(
    /doesn't look like a Claude token/,
  );
  expect(() => storeAnthropicToken("   ", () => {})).toThrow(/No token/);
});

test("PASTE flow surfaces the help URL, then stores the pasted token", async () => {
  const seen: { info?: { url: string; instructions: string } } = {};
  const stored: string[] = [];
  await runAnthropicSetupTokenLogin(
    {
      onAuth: (i) => {
        seen.info = i;
      },
      onManualCodeInput: async () => "sk-ant-oat01-pasted",
    },
    { store: (k) => stored.push(k) },
  );
  // Wire shape unchanged: a help URL + paste instructions (auth_code in login.ts).
  // The URL is the Console's API-keys page — somewhere a non-technical user can
  // actually mint a pasteable value without a terminal.
  expect(seen.info?.url).toContain("console.anthropic.com");
  expect(seen.info?.instructions).toMatch(/API key/);
  expect(stored).toEqual(["sk-ant-oat01-pasted"]);
});

test("PASTE flow copy never instructs running a CLI (2026-08-15 incident)", async () => {
  // Older clients render this wire string verbatim, and Houston's audience is
  // non-technical: an instruction like "run `claude setup-token` in your
  // terminal" must never reach a user again.
  const seen: { info?: { url: string; instructions: string } } = {};
  await runAnthropicSetupTokenLogin(
    {
      onAuth: (i) => {
        seen.info = i;
      },
      onManualCodeInput: async () => "sk-ant-oat01-pasted",
    },
    { store: () => {} },
  );
  expect(seen.info?.instructions).not.toMatch(
    /setup-token|terminal|CLI|command/i,
  );
  expect(seen.info?.url).not.toMatch(/cli-reference/);
});

test("PASTE flow rejects a junk paste (validation, no silent failure)", async () => {
  await expect(
    runAnthropicSetupTokenLogin(
      { onAuth: () => {}, onManualCodeInput: async () => "junk" },
      { store: () => {} },
    ),
  ).rejects.toThrow(/Claude token/);
});

test("Gate #2 scrub leaves the anthropic api_key entry intact", () => {
  const dir = mkdtempSync(join(tmpdir(), "setup-token-"));
  const path = join(dir, "auth.json");
  const auth: Record<string, PiCred> = {
    anthropic: { type: "api_key", key: "sk-ant-oat01-live" },
    "openai-codex": {
      type: "oauth",
      access: "acc",
      refresh: "refresh-secret",
      expires: 123,
    },
  };
  writeFileSync(path, JSON.stringify(auth));
  // The codex connect's provider-scoped scrub (PRODUCT-1320) — and even a
  // direct scrub aimed at anthropic — leaves the api_key entry intact: it
  // carries no refresh token, so the stored setup token survives verbatim.
  expect(scrubRefreshTokenAt(path, "anthropic")).toBe(false);
  expect(scrubRefreshTokenAt(path, "openai-codex")).toBe(true);
  const after = JSON.parse(readFileSync(path, "utf8")) as Record<
    string,
    PiCred
  >;
  expect(after.anthropic).toEqual({
    type: "api_key",
    key: "sk-ant-oat01-live",
  });
  expect((after["openai-codex"] as { refresh: string }).refresh).toBe("");
});
