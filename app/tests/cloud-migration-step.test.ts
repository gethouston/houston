import assert from "node:assert/strict";
import test from "node:test";
import {
  MigrationAbandonedError,
  MigrationStepError,
  runStep,
  taskFailureOutcome,
} from "../src/lib/cloud-migration-step.ts";

// ── runStep ────────────────────────────────────────────────────────────

test("runStep resolves the work's value while the run is live", async () => {
  const value = await runStep(
    "uploading",
    async () => 42,
    () => false,
  );
  assert.equal(value, 42);
});

test("runStep tags a raw failure with the step it failed in", async () => {
  await assert.rejects(
    runStep(
      "warming",
      async () => {
        throw new TypeError("Load failed (127.0.0.1:60003)");
      },
      () => false,
    ),
    (err: unknown) =>
      err instanceof MigrationStepError &&
      err.step === "warming" &&
      err.message === "Load failed (127.0.0.1:60003)",
  );
});

test("runStep passes an already-tagged failure through unchanged", async () => {
  const inner = new MigrationStepError("creating", new Error("boom"));
  await assert.rejects(
    runStep(
      "uploading",
      async () => {
        throw inner;
      },
      () => false,
    ),
    (err: unknown) => err === inner,
  );
});

// "Migrate later" mid-run: the source host is already stopped, so the step
// must never start (the export would only produce a phantom transport error).
test("runStep refuses to start once the run is abandoned", async () => {
  let started = false;
  await assert.rejects(
    runStep(
      "uploading",
      async () => {
        started = true;
      },
      () => true,
    ),
    (err: unknown) => err instanceof MigrationAbandonedError,
  );
  assert.equal(started, false);
});

test("runStep re-reads the abandon flag at every step", async () => {
  let deferred = false;
  await runStep(
    "creating",
    async () => undefined,
    () => deferred,
  );
  deferred = true;
  await assert.rejects(
    runStep(
      "warming",
      async () => undefined,
      () => deferred,
    ),
    MigrationAbandonedError,
  );
});

// ── taskFailureOutcome ─────────────────────────────────────────────────

test("an abandoned step settles as abandoned", () => {
  assert.deepEqual(taskFailureOutcome(new MigrationAbandonedError(), true), {
    kind: "abandoned",
  });
});

test("a transport error racing the source-host stop is abandoned, not failed", () => {
  // The fetch left before the guard saw `deferred`; the store reads the flag
  // at settle time, so the phantom "Load failed" never becomes an error row.
  const err = new MigrationStepError(
    "uploading",
    new TypeError("Load failed (127.0.0.1:60003)"),
  );
  assert.deepEqual(taskFailureOutcome(err, true), { kind: "abandoned" });
});

test("the same transport error on a live run is a real failure", () => {
  const err = new MigrationStepError(
    "uploading",
    new TypeError("Load failed (127.0.0.1:60003)"),
  );
  assert.deepEqual(taskFailureOutcome(err, false), {
    kind: "failed",
    step: "uploading",
    message: "Load failed (127.0.0.1:60003)",
  });
});

test("an untagged failure defaults to the uploading step", () => {
  assert.deepEqual(taskFailureOutcome("disk full", false), {
    kind: "failed",
    step: "uploading",
    message: "disk full",
  });
});
