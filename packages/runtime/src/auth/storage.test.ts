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

/** A fresh file-backed store in an isolated tmp dir (no shared singleton). */
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
    // The trap that broke logout: pi's RESOLVED auth treats the ambient env key
    // as usable (a model request would succeed), so a status derived from it
    // reported "configured" forever. Houston must NOT call that connected — the
    // user never connected it here and "Sign out" cannot clear an env var.
    expect(providerConnected(store, "openrouter")).toBe(false);

    // A pasted key is a real connection; signing out disconnects even though
    // the env var is still set (the old hasAuth() path stayed stuck on).
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
  // Nothing pasted, shared dir empty → not connected.
  expect(providerConnected(store, "anthropic")).toBe(false);
  // The browser login populated the shared dir → the probe reads logged-in,
  // even though auth.json holds no anthropic credential.
  await refreshAnthropicCredential(async () => true);
  expect(providerConnected(store, "anthropic")).toBe(true);
  // Sign out clears the shared-dir credential → disconnected again.
  resetAnthropicCredentialCache(false);
  expect(providerConnected(store, "anthropic")).toBe(false);
});

test("providerConnected(anthropic): a pasted setup token also counts (degraded fallback)", async () => {
  const store = tmpStore();
  await refreshAnthropicCredential(async () => false); // shared dir empty
  expect(providerConnected(store, "anthropic")).toBe(false);
  store.set("anthropic", { type: "api_key", key: "sk-ant-oat01-x" });
  expect(providerConnected(store, "anthropic")).toBe(true);
});

test("credentialUsable: presence is not connection — a dead serve-written entry reads unusable", () => {
  const now = 1_784_000_000_000;
  // An API key never expires (it was live-verified at connect).
  expect(credentialUsable({ type: "api_key" }, now)).toBe(true);
  // OAuth with a refresh token: pi auto-refreshes → usable even past expiry.
  expect(
    credentialUsable({ type: "oauth", refresh: "rt", expires: now - 1 }, now),
  ).toBe(true);
  // The Gate #2 serve shape (refresh="") is usable only until it expires…
  expect(
    credentialUsable(
      { type: "oauth", refresh: "", expires: now + 60_000 },
      now,
    ),
  ).toBe(true);
  // …and DEAD after: this is the stale entry that showed "Connected" while
  // every turn failed with the reconnect card.
  expect(
    credentialUsable({ type: "oauth", refresh: "", expires: now - 1 }, now),
  ).toBe(false);
  // expires 0/absent = no expiry recorded (a pasted token stored as oauth).
  expect(
    credentialUsable({ type: "oauth", refresh: "", expires: 0 }, now),
  ).toBe(true);
  expect(credentialUsable(undefined, now)).toBe(false);
  // An unrecognized variant is not something we can vouch for.
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
  // The same shape while still fresh IS connected.
  store.set("openai-codex", {
    type: "oauth",
    access: "at",
    refresh: "",
    expires: Date.now() + 60_000,
  });
  expect(providerConnected(store, "openai-codex")).toBe(true);

  // Anthropic's auth.json entry follows the same rule (the probe stays off).
  await refreshAnthropicCredential(async () => false);
  resetAnthropicCredentialCache(false);
  store.set("anthropic", {
    type: "oauth",
    access: "at",
    refresh: "",
    expires: Date.now() - 60_000,
  });
  expect(providerConnected(store, "anthropic")).toBe(false);
});
