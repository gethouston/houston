import assert from "node:assert/strict";
import test from "node:test";
import { pickerModelRows, providerPickerState } from "./model-picker.ts";

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

test("pickerModelRows: a catalogued provider shows its catalog, ignoring the runtime model", () => {
  const catalog = [
    { id: "claude-sonnet-4-6", label: "Sonnet 4.6", description: "Balanced." },
  ];
  // A normal provider keeps its static catalog even if a runtime model is passed.
  assert.deepEqual(pickerModelRows(catalog, "ignored", "sub"), catalog);
});

test("pickerModelRows: a catalog-less provider surfaces its engine-reported model", () => {
  // The local OpenAI-compatible provider (empty catalog) shows the single model
  // the engine reports — this is what makes it appear + be selectable in the
  // chat picker after connecting from Settings.
  assert.deepEqual(pickerModelRows([], "llama3.1", "Ollama, LM Studio…"), [
    { id: "llama3.1", label: "llama3.1", description: "Ollama, LM Studio…" },
  ]);
});

test("pickerModelRows: a catalog-less provider with no engine model shows nothing", () => {
  // Nothing to show yet → empty, so the caller skips the group (no dangling header).
  assert.deepEqual(pickerModelRows([], undefined, "sub"), []);
});
