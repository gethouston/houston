import assert from "node:assert/strict";
import test from "node:test";
import { cloudMigrationGateState } from "../src/hooks/cloud-migration-trigger.ts";

const SHOW = {
  remoteGateway: true,
  isTauri: true,
  signedIn: true,
  hasLegacyWorkspaces: true,
  outcome: null,
  loading: false,
} as const;

test("shows for a signed-in gateway desktop with legacy data", () => {
  assert.equal(cloudMigrationGateState(SHOW), "show");
});

test("never shows again once this machine finished the wizard, even with leftover legacy data", () => {
  assert.equal(cloudMigrationGateState({ ...SHOW, outcome: "done" }), "pass");
});

test("never shows outside remote gateway mode (local sidecar / dev host)", () => {
  assert.equal(
    cloudMigrationGateState({ ...SHOW, remoteGateway: false }),
    "pass",
  );
});

test("never shows outside the Tauri shell (web build)", () => {
  assert.equal(cloudMigrationGateState({ ...SHOW, isTauri: false }), "pass");
});

test("never shows without a signed-in identity to key the outcome on", () => {
  assert.equal(cloudMigrationGateState({ ...SHOW, signedIn: false }), "pass");
});

test("passes once the user finished or declined", () => {
  assert.equal(cloudMigrationGateState({ ...SHOW, outcome: "done" }), "pass");
  assert.equal(
    cloudMigrationGateState({ ...SHOW, outcome: "skipped" }),
    "pass",
  );
});

test("passes on a machine with no legacy data", () => {
  assert.equal(
    cloudMigrationGateState({ ...SHOW, hasLegacyWorkspaces: false }),
    "pass",
  );
});

test("holds a splash while the detection probe is in flight", () => {
  assert.equal(cloudMigrationGateState({ ...SHOW, loading: true }), "loading");
});

test("loading never blocks builds the gate can't apply to", () => {
  assert.equal(
    cloudMigrationGateState({ ...SHOW, remoteGateway: false, loading: true }),
    "pass",
  );
  assert.equal(
    cloudMigrationGateState({ ...SHOW, isTauri: false, loading: true }),
    "pass",
  );
  assert.equal(
    cloudMigrationGateState({ ...SHOW, outcome: "skipped", loading: true }),
    "pass",
  );
});
