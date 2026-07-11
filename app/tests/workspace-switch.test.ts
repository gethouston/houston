import assert from "node:assert/strict";
import test from "node:test";
import type { Workspace } from "../src/lib/types.ts";
import { resolveActiveWorkspace } from "../src/lib/workspace-switch.ts";

const ws = (id: string, isDefault = false): Workspace => ({
  id,
  name: id,
  isDefault,
  createdAt: "2026-01-01T00:00:00.000Z",
});

const PERSONAL = ws("ws_personal", true);
const TEAM_A = ws("org:0123456789abcdef");
const TEAM_B = ws("org:fedcba9876543210");

test("restores the last-selected workspace when still present", () => {
  const list = [PERSONAL, TEAM_A, TEAM_B];
  assert.equal(resolveActiveWorkspace(list, "org:fedcba9876543210"), TEAM_B);
});

test("falls back to the default when the persisted id is gone", () => {
  const list = [PERSONAL, TEAM_A];
  // The user last used a team they were removed from since.
  assert.equal(resolveActiveWorkspace(list, "org:deadbeefdeadbeef"), PERSONAL);
});

test("falls back to the default with no persisted id", () => {
  assert.equal(resolveActiveWorkspace([PERSONAL, TEAM_A], null), PERSONAL);
});

test("falls back to the first when there is no default", () => {
  assert.equal(resolveActiveWorkspace([TEAM_A, TEAM_B], null), TEAM_A);
});

test("empty list resolves to null", () => {
  assert.equal(resolveActiveWorkspace([], "ws_personal"), null);
});

test("personal-only host resolves to its single workspace either way", () => {
  // Byte-identical behaviour: whether or not a stale id was persisted, the sole
  // default workspace is selected.
  assert.equal(resolveActiveWorkspace([PERSONAL], null), PERSONAL);
  assert.equal(resolveActiveWorkspace([PERSONAL], "stale"), PERSONAL);
  assert.equal(resolveActiveWorkspace([PERSONAL], "ws_personal"), PERSONAL);
});
