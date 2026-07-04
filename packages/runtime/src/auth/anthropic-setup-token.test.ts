import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import {
  isAnthropicToken,
  runAnthropicSetupTokenLogin,
  storeAnthropicToken,
} from "./anthropic-setup-token";
import { type PiCred, scrubRefreshTokensAt } from "./auth-file";

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
  // Wire shape unchanged: a docs URL + paste instructions (auth_code in login.ts).
  expect(seen.info?.url).toContain("docs.claude.com");
  expect(seen.info?.instructions).toMatch(/claude setup-token/);
  expect(stored).toEqual(["sk-ant-oat01-pasted"]);
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
  const scrubbed = scrubRefreshTokensAt(path);
  const after = JSON.parse(readFileSync(path, "utf8")) as Record<
    string,
    PiCred
  >;
  // The api_key anthropic entry carries no refresh token, so scrub never touches
  // it — the stored setup token survives the per-connect scrub verbatim.
  expect(scrubbed).toEqual(["openai-codex"]);
  expect(after.anthropic).toEqual({
    type: "api_key",
    key: "sk-ant-oat01-live",
  });
  expect((after["openai-codex"] as { refresh: string }).refresh).toBe("");
});
