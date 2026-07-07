import assert from "node:assert/strict";
import test from "node:test";
import { cloudMigrationGateState } from "../src/hooks/cloud-migration-trigger.ts";

// The "show" case: a signed-in user on the remote-gateway desktop build, with
// legacy data on disk, no persisted outcome, every signal resolved.
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
  // The splash is only reachable once the cheap gates hold — a web build or
  // local sidecar must render instantly, whatever the probe state.
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
