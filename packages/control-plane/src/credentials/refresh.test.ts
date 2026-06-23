import { expect, test } from "bun:test";
import { isApiKeyCredential, type WorkspaceCredential } from "../ports";
import { isExpiring, refreshCredential } from "./refresh";

/**
 * The connect-once refresher is OAuth-only. An API-key credential (OpenCode Zen /
 * Go) never expires and has nothing to rotate, so it must be treated as a no-op
 * by both the expiry check and the refresh — a stray OAuth token call against a
 * pasted key would 4xx and break every turn.
 */

const apiKey: WorkspaceCredential = {
  workspaceId: "ws_1",
  provider: "opencode",
  accessToken: "sk-opencode-zen",
  refreshToken: "",
  expiresAt: 0,
  kind: "api_key",
};

test("isApiKeyCredential recognises both the kind tag and the expiresAt=0 sentinel", () => {
  expect(isApiKeyCredential(apiKey)).toBe(true);
  expect(isApiKeyCredential({ ...apiKey, kind: undefined })).toBe(true); // sentinel alone
  expect(
    isApiKeyCredential({
      workspaceId: "ws_1",
      provider: "openai-codex",
      accessToken: "at",
      refreshToken: "rt",
      expiresAt: 1_900_000_000_000,
    }),
  ).toBe(false);
});

test("isExpiring is false for an api-key credential (never expires)", () => {
  expect(isExpiring(apiKey)).toBe(false);
});

test("refreshCredential returns an api-key credential unchanged (no OAuth call)", async () => {
  expect(await refreshCredential(apiKey)).toEqual(apiKey);
});

test("isExpiring is true for an already-expired oauth token", () => {
  expect(
    isExpiring({
      workspaceId: "ws_1",
      provider: "openai-codex",
      accessToken: "at",
      refreshToken: "rt",
      expiresAt: 1, // long past
    }),
  ).toBe(true);
});
