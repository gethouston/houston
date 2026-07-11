import assert from "node:assert/strict";
import { test } from "node:test";
import { stepPosition } from "./setup-steps.ts";

const WITH_EMAIL = { emailSteps: true };
const NO_EMAIL = { emailSteps: false };

test("with email steps, first-run is one flat sequence of three steps", () => {
  // Step 1 — the shared AI picker (the old pick + login screens collapsed onto
  // the single `connect` step, so their ids are no longer numbered steps).
  assert.deepEqual(stepPosition("connect", WITH_EMAIL), {
    current: 1,
    total: 3,
  });
  assert.equal(stepPosition("brain", WITH_EMAIL), null);
  assert.equal(stepPosition("providerLogin", WITH_EMAIL), null);
  // The apps/tools step was dropped (platform-mode Composio has no per-user
  // account to sign into); it is no longer a numbered step.
  assert.equal(stepPosition("tools", WITH_EMAIL), null);
  // Step 2 — connect your email.
  assert.deepEqual(stepPosition("connectEmail", WITH_EMAIL), {
    current: 2,
    total: 3,
  });
  // Step 3 — the assistant sends one real email.
  assert.deepEqual(stepPosition("emailChat", WITH_EMAIL), {
    current: 3,
    total: 3,
  });
});

test("without integrations, only the connect step is numbered (Step 1 of 1)", () => {
  // A no-integrations deployment never renders the email screens, so they must
  // not inflate the total — the sole visible step is honestly "Step 1 of 1".
  assert.deepEqual(stepPosition("connect", NO_EMAIL), { current: 1, total: 1 });
  // The email screens never render here, so they carry no step number.
  assert.equal(stepPosition("connectEmail", NO_EMAIL), null);
  assert.equal(stepPosition("emailChat", NO_EMAIL), null);
});

test("the agent-naming step is gone", () => {
  // Houston ships one great default Personal Assistant; there is no naming step.
  assert.equal(stepPosition("meet", WITH_EMAIL), null);
  assert.equal(stepPosition("meet", NO_EMAIL), null);
});

test("gates and success screens are not numbered steps", () => {
  for (const opts of [WITH_EMAIL, NO_EMAIL]) {
    assert.equal(stepPosition("language", opts), null);
    assert.equal(stepPosition("agreement", opts), null);
    assert.equal(stepPosition("intro", opts), null);
    assert.equal(stepPosition("aiConnected", opts), null);
    assert.equal(stepPosition("emailConnected", opts), null);
    assert.equal(stepPosition("finished", opts), null);
  }
});
