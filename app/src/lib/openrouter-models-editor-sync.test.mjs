import test from "node:test";
import assert from "node:assert/strict";
import { syncOpenRouterEditorActions } from "./openrouter-models-editor-sync.ts";

const finish = () => {};

test("syncOpenRouterEditorActions keeps prev when footer flags unchanged", () => {
  const prev = { canFinish: true, saving: false, onFinish: finish };
  const next = { canFinish: true, saving: false, onFinish: () => {} };
  assert.equal(syncOpenRouterEditorActions(prev, next), prev);
});

test("syncOpenRouterEditorActions replaces when canFinish changes", () => {
  const prev = { canFinish: false, saving: false, onFinish: finish };
  const next = { canFinish: true, saving: false, onFinish: finish };
  assert.equal(syncOpenRouterEditorActions(prev, next), next);
});

test("syncOpenRouterEditorActions clears to null", () => {
  const prev = { canFinish: true, saving: false, onFinish: finish };
  assert.equal(syncOpenRouterEditorActions(prev, null), null);
});
