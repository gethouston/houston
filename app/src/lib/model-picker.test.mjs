import assert from "node:assert/strict";
import test from "node:test";
import {
  providerPickerState,
  shouldShowProviderInPicker,
} from "./model-picker.ts";

const CONNECTED = { cli_installed: true, authenticated: true };
const INSTALLED_UNAUTH = { cli_installed: true, authenticated: false };
const MISSING = { cli_installed: false, authenticated: false };

test("providerPickerState: known statuses map to connected / disconnected", () => {
  assert.equal(providerPickerState(CONNECTED, false), "connected");
  // A connected status wins even if a background refetch is in flight.
  assert.equal(providerPickerState(CONNECTED, true), "connected");
  assert.equal(providerPickerState(INSTALLED_UNAUTH, false), "disconnected");
  assert.equal(providerPickerState(MISSING, false), "disconnected");
});

test("providerPickerState: missing status is 'checking' only while loading", () => {
  // The #342 fix: before statuses resolve, providers read as 'checking', NOT
  // 'disconnected', so the picker never shows a false "Not connected".
  assert.equal(providerPickerState(undefined, true), "checking");
  // Not loading + no status (e.g. the fetch failed) degrades to disconnected
  // rather than spinning forever.
  assert.equal(providerPickerState(undefined, false), "disconnected");
});

test("shouldShowProviderInPicker: 'checking' keeps every provider visible (#342)", () => {
  // Before resolution a non-active provider must stay visible so the list does
  // not collapse to a single "Not connected" entry — the reported bug.
  assert.equal(
    shouldShowProviderInPicker({
      providerId: "openai",
      state: "checking",
      isActiveProvider: false,
    }),
    true,
  );
});

test("shouldShowProviderInPicker: known-disconnected non-active providers are hidden", () => {
  assert.equal(
    shouldShowProviderInPicker({
      providerId: "openai",
      state: "disconnected",
      isActiveProvider: false,
    }),
    false,
  );
});

test("shouldShowProviderInPicker: connected non-active providers are shown", () => {
  assert.equal(
    shouldShowProviderInPicker({
      providerId: "openai",
      state: "connected",
      isActiveProvider: false,
    }),
    true,
  );
});

test("shouldShowProviderInPicker: the active provider is always shown", () => {
  for (const state of ["connected", "disconnected", "checking"]) {
    assert.equal(
      shouldShowProviderInPicker({
        providerId: "anthropic",
        state,
        isActiveProvider: true,
      }),
      true,
      `active provider should show while ${state}`,
    );
  }
});

test("shouldShowProviderInPicker: every connected provider stays selectable (no mid-conversation lock)", () => {
  // The provider is never locked once a conversation starts: switching
  // providers mid-stream is supported (the runtime continues the same
  // conversation across providers).
  for (const providerId of ["openai", "anthropic"]) {
    assert.equal(
      shouldShowProviderInPicker({
        providerId,
        state: "connected",
        isActiveProvider: false,
      }),
      true,
    );
  }
});
