import assert from "node:assert/strict";
import test from "node:test";
import {
  MigrationAbandonedError,
  MigrationStepError,
  migrationFailureCause,
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

// The envelope must not hide the browser's TypeError: the quiet connectivity
// classifier keys on it, and a wrapper without `cause` filed every upload cut
// by the network as a bug (HOUSTON-APP-4PQ / 4PG).
test("runStep keeps the wrapped failure on cause", async () => {
  const inner = new TypeError("Failed to fetch (gateway.gethouston.ai)");
  await assert.rejects(
    runStep(
      "uploading",
      async () => {
        throw inner;
      },
      () => false,
    ),
    (err: unknown) =>
      err instanceof MigrationStepError &&
      err.cause === inner &&
      migrationFailureCause(err) === inner,
  );
});

test("migrationFailureCause passes an unwrapped failure through", () => {
  const plain = new Error("boom");
  assert.equal(migrationFailureCause(plain), plain);
  assert.equal(migrationFailureCause("disk full"), "disk full");
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
  const cause = new TypeError("Load failed (127.0.0.1:60003)");
  const err = new MigrationStepError("uploading", cause);
  assert.deepEqual(taskFailureOutcome(err, false), {
    kind: "failed",
    step: "uploading",
    message: "Load failed (127.0.0.1:60003)",
    cause,
    transport: true,
  });
});

// A 48 MB chunk cut by the ingress's 60 s body deadline arrives exactly like
// this: Chromium's bare "Failed to fetch" with no response. The row gets
// authored copy and Sentry the quiet connectivity class, both keyed on
// `transport`.
test("an upload cut mid-flight is a transport failure of the uploading step", () => {
  const cause = new TypeError("Failed to fetch (gateway.gethouston.ai)");
  const outcome = taskFailureOutcome(
    new MigrationStepError("uploading", cause),
    false,
  );
  assert.equal(outcome.kind, "failed");
  if (outcome.kind !== "failed") return;
  assert.equal(outcome.transport, true);
  assert.equal(outcome.cause, cause);
});

test("a gateway rejection is not a transport failure", () => {
  const cause = new Error("migration import: HTTP 413");
  const outcome = taskFailureOutcome(
    new MigrationStepError("uploading", cause),
    false,
  );
  assert.deepEqual(outcome, {
    kind: "failed",
    step: "uploading",
    message: "migration import: HTTP 413",
    cause,
    transport: false,
  });
});

test("an untagged failure defaults to the uploading step", () => {
  assert.deepEqual(taskFailureOutcome("disk full", false), {
    kind: "failed",
    step: "uploading",
    message: "disk full",
    cause: "disk full",
    transport: false,
  });
});
