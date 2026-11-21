import assert from "node:assert/strict";
import test from "node:test";
import { pickerModelRows } from "./model-picker.ts";

test("pickerModelRows: a catalogued provider shows its catalog, ignoring the runtime model", () => {
  const catalog = [
    { id: "claude-sonnet-4-6", label: "Sonnet 4.6", description: "Balanced." },
  ];
  assert.deepEqual(pickerModelRows(catalog, "ignored", "sub"), catalog);
});

test("pickerModelRows: a catalog-less provider surfaces its engine-reported model", () => {
  assert.deepEqual(pickerModelRows([], "llama3.1", "Ollama, LM Studio…"), [
    { id: "llama3.1", label: "llama3.1", description: "Ollama, LM Studio…" },
  ]);
});

test("pickerModelRows: a catalog-less provider with no engine model shows nothing", () => {
  assert.deepEqual(pickerModelRows([], undefined, "sub"), []);
});
