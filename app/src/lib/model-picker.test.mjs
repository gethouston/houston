import assert from "node:assert/strict";
import test from "node:test";
import { pickerModelRows } from "./model-picker.ts";

// The provider CONNECTION derivation moved to `provider-connection.ts` (one home
// for every surface, HOU-979); its cases live in `app/tests/provider-connection.test.ts`.

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
