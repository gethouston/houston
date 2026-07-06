import { AuthStorage } from "@earendil-works/pi-coding-agent";
import { expect, test } from "vitest";
import {
  refreshAnthropicCredential,
  resetAnthropicCredentialCache,
} from "../backends/claude/credential-status";
import { providerConnected } from "./storage";

test("providerConnected: only a STORED credential counts; connect then logout flips it", () => {
  const store = AuthStorage.inMemory({});
  expect(providerConnected(store, "openrouter")).toBe(false);
  store.set("openrouter", { type: "api_key", key: "sk-or-stored" });
  expect(providerConnected(store, "openrouter")).toBe(true);
  store.logout("openrouter");
  expect(providerConnected(store, "openrouter")).toBe(false);
});

test("providerConnected: an ambient env API key is NOT a connection, so logout still disconnects (HOU-557)", () => {
  const prev = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "sk-or-ambient";
  try {
    const store = AuthStorage.inMemory({});
    // The trap that broke logout: pi's hasAuth() treats the ambient env key as
    // usable auth, so the provider reported "configured" forever.
    expect(store.hasAuth("openrouter")).toBe(true);
    // Houston must NOT call that connected — the user never connected it here
    // and "Sign out" cannot clear an env var.
    expect(providerConnected(store, "openrouter")).toBe(false);

    // A pasted key is a real connection; signing out disconnects even though
    // the env var is still set (the old hasAuth() path stayed stuck on).
    store.set("openrouter", { type: "api_key", key: "sk-or-stored" });
    expect(providerConnected(store, "openrouter")).toBe(true);
    store.logout("openrouter");
    expect(providerConnected(store, "openrouter")).toBe(false);
  } finally {
    if (prev === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = prev;
  }
});

test("providerConnected(anthropic): the shared-dir credential probe counts with no auth.json entry", async () => {
  const store = AuthStorage.inMemory({});
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
  const store = AuthStorage.inMemory({});
  await refreshAnthropicCredential(async () => false); // shared dir empty
  expect(providerConnected(store, "anthropic")).toBe(false);
  store.set("anthropic", { type: "api_key", key: "sk-ant-oat01-x" });
  expect(providerConnected(store, "anthropic")).toBe(true);
});
