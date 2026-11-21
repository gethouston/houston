import assert from "node:assert/strict";
import test from "node:test";
import { resolveActiveWorkspace } from "@houston/sdk";
import type { Workspace } from "../src/lib/types.ts";
import { workspaceGateState } from "../src/lib/workspace-switch.ts";

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

test("falls back to a team when the persisted id is gone", () => {
  const list = [PERSONAL, TEAM_A];
  assert.equal(resolveActiveWorkspace(list, "org:deadbeefdeadbeef"), TEAM_A);
});

test("falls back to a team with no persisted id", () => {
  assert.equal(resolveActiveWorkspace([PERSONAL, TEAM_A], null), TEAM_A);
});

test("falls back to the first when there is no default", () => {
  assert.equal(resolveActiveWorkspace([TEAM_A, TEAM_B], null), TEAM_A);
});

test("empty list resolves to null", () => {
  assert.equal(resolveActiveWorkspace([], "ws_personal"), null);
});

test("personal-only host resolves to its single workspace either way", () => {
  assert.equal(resolveActiveWorkspace([PERSONAL], null), PERSONAL);
  assert.equal(resolveActiveWorkspace([PERSONAL], "stale"), PERSONAL);
  assert.equal(resolveActiveWorkspace([PERSONAL], "ws_personal"), PERSONAL);
});

test("gate is loading while the store is still fetching", () => {
  assert.equal(
    workspaceGateState({ current: null, loading: true, loadError: false }),
    "loading",
  );
});

test("gate is failed once a THROWN load leaves no workspace", () => {
  assert.equal(
    workspaceGateState({ current: null, loading: false, loadError: true }),
    "failed",
  );
});

test("gate is empty when the load succeeded with nothing to show", () => {
  assert.equal(
    workspaceGateState({ current: null, loading: false, loadError: false }),
    "empty",
  );
});

test("gate is ready as soon as a workspace is current", () => {
  assert.equal(
    workspaceGateState({ current: PERSONAL, loading: false, loadError: false }),
    "ready",
  );
});

test("gate prefers a current workspace over an in-flight refresh", () => {
  assert.equal(
    workspaceGateState({ current: PERSONAL, loading: true, loadError: false }),
    "ready",
  );
});

test("gate spins during a retry that follows a failure", () => {
  assert.equal(
    workspaceGateState({ current: null, loading: true, loadError: true }),
    "loading",
  );
});
