import { AuthStorage } from "@earendil-works/pi-coding-agent";
import { expect, test } from "vitest";
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
