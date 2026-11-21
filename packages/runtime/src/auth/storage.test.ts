import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import {
  refreshAnthropicCredential,
  resetAnthropicCredentialCache,
} from "../backends/claude/credential-status";
import { HoustonAuthStore } from "./credential-store";
import { credentialUsable, providerConnected } from "./storage";

function tmpStore(): HoustonAuthStore {
  return new HoustonAuthStore(
    join(mkdtempSync(join(tmpdir(), "houston-auth-")), "auth.json"),
  );
}

test("providerConnected: only a STORED credential counts; connect then logout flips it", () => {
  const store = tmpStore();
  expect(providerConnected(store, "openrouter")).toBe(false);
  store.set("openrouter", { type: "api_key", key: "sk-or-stored" });
  expect(providerConnected(store, "openrouter")).toBe(true);
  store.remove("openrouter");
  expect(providerConnected(store, "openrouter")).toBe(false);
});

test("providerConnected: an ambient env API key is NOT a connection, so logout still disconnects (HOU-557)", () => {
  const prev = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "sk-or-ambient";
  try {
    const store = tmpStore();
    expect(providerConnected(store, "openrouter")).toBe(false);

    store.set("openrouter", { type: "api_key", key: "sk-or-stored" });
    expect(providerConnected(store, "openrouter")).toBe(true);
    store.remove("openrouter");
    expect(providerConnected(store, "openrouter")).toBe(false);
  } finally {
    if (prev === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = prev;
  }
});

test("providerConnected(anthropic): the shared-dir credential probe counts with no auth.json entry", async () => {
  const store = tmpStore();
  resetAnthropicCredentialCache(false);
  expect(providerConnected(store, "anthropic")).toBe(false);
  await refreshAnthropicCredential(async () => ({
    known: true,
    loggedIn: true,
  }));
  expect(providerConnected(store, "anthropic")).toBe(true);
  resetAnthropicCredentialCache(false);
  expect(providerConnected(store, "anthropic")).toBe(false);
});

test("providerConnected(anthropic): a pasted setup token also counts (degraded fallback)", async () => {
  const store = tmpStore();
  await refreshAnthropicCredential(async () => ({
    known: true,
    loggedIn: false,
  }));
  expect(providerConnected(store, "anthropic")).toBe(false);
  store.set("anthropic", { type: "api_key", key: "sk-ant-oat01-x" });
  expect(providerConnected(store, "anthropic")).toBe(true);
});

test("credentialUsable: presence is not connection — a dead serve-written entry reads unusable", () => {
  const now = 1_784_000_000_000;
  expect(credentialUsable({ type: "api_key" }, now)).toBe(true);
  expect(
    credentialUsable({ type: "oauth", refresh: "rt", expires: now - 1 }, now),
  ).toBe(true);
  expect(
    credentialUsable(
      { type: "oauth", refresh: "", expires: now + 60_000 },
      now,
    ),
  ).toBe(true);
  expect(
    credentialUsable({ type: "oauth", refresh: "", expires: now - 1 }, now),
  ).toBe(false);
  expect(
    credentialUsable({ type: "oauth", refresh: "", expires: 0 }, now),
  ).toBe(true);
  expect(credentialUsable(undefined, now)).toBe(false);
  expect(credentialUsable({ type: "mystery" }, now)).toBe(false);
});

test("providerConnected: an EXPIRED access-only oauth entry no longer counts as connected", async () => {
  const store = tmpStore();
  store.set("openai-codex", {
    type: "oauth",
    access: "at",
    refresh: "",
    expires: Date.now() - 60_000,
  });
  expect(providerConnected(store, "openai-codex")).toBe(false);
  store.set("openai-codex", {
    type: "oauth",
    access: "at",
    refresh: "",
    expires: Date.now() + 60_000,
  });
  expect(providerConnected(store, "openai-codex")).toBe(true);

  await refreshAnthropicCredential(async () => ({
    known: true,
    loggedIn: false,
  }));
  resetAnthropicCredentialCache(false);
  store.set("anthropic", {
    type: "oauth",
    access: "at",
    refresh: "",
    expires: Date.now() - 60_000,
  });
  expect(providerConnected(store, "anthropic")).toBe(false);
});
