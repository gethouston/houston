import assert from "node:assert/strict";
import test from "node:test";
import { HoustonEngineError } from "@houston/engine-adapter/client/errors";
import {
  type MigrationErrorCopy,
  type MigrationGatewayEngine,
  migrationCall,
  migrationErrorMessage,
  nullOn404,
  toMigrationError,
} from "../src/lib/cloud-migration-errors.ts";
import { taskFailureOutcome } from "../src/lib/cloud-migration-step.ts";

/**
 * The wizard's gateway leg rides the bound client, and the per-agent row
 * renders the thrown message VERBATIM — so what is pinned here is the row's
 * text, character for character, plus the two failures that must NOT be
 * re-worded: a cut upload (the connectivity classifier keys on the browser's
 * own TypeError) and a status the pod never answered.
 */

const COPY: MigrationErrorCopy = {
  notConnected: "We can't reach the cloud right now.",
  signedOut: "Sign in again to keep moving your data.",
};

const MARKER = {
  completedAt: "2026-09-15T10:00:00.000Z",
  source: { workspace: "Personal", agent: "Assistant" },
  counts: { written: 9, skipped: 2, rejected: 0, sessionsRebuilt: true },
};

/** An engine whose every call fails the same way, or answers the same marker. */
function engineThat(answer: () => Promise<unknown>): MigrationGatewayEngine {
  const call = answer as () => Promise<never>;
  return {
    migrationImport: call,
    migrationComplete: call,
    migrationStatus: call,
  };
}

const deps = (engine: () => MigrationGatewayEngine) => ({ engine, copy: COPY });

// ── the row's text ─────────────────────────────────────────────────────

test("a server-side refusal keeps the server's reason behind the label", async () => {
  const err = await migrationCall(
    "migration import",
    deps(() =>
      engineThat(async () => {
        throw new HoustonEngineError(413, { error: "import body too large" });
      }),
    ),
    (engine) => engine.migrationImport("a1", new ArrayBuffer(0)),
  ).catch((e: unknown) => e);
  assert.ok(err instanceof Error);
  assert.equal(err.message, "migration import: import body too large");
});

test("an answer that named no reason reads as the bare status", () => {
  assert.equal(
    migrationErrorMessage(
      "migration complete",
      new HoustonEngineError(502, {}),
    ),
    "migration complete: HTTP 502",
  );
});

test("the synthetic signed-out 401 reads as the authored copy", async () => {
  const err = await migrationCall(
    "migration status",
    deps(() =>
      engineThat(async () => {
        throw new HoustonEngineError(401, { error: "signed_out" });
      }),
    ),
    (engine) => engine.migrationStatus("a1"),
  ).catch((e: unknown) => e);
  assert.ok(err instanceof Error);
  assert.equal(err.message, COPY.signedOut);
});

test("no bound engine reads as the authored not-connected copy", async () => {
  const err = await migrationCall(
    "migration import",
    deps(() => {
      throw new Error("[engine] not bootstrapped.");
    }),
    (engine) => engine.migrationImport("a1", new ArrayBuffer(0)),
  ).catch((e: unknown) => e);
  assert.ok(err instanceof Error);
  assert.equal(err.message, COPY.notConnected);
});

// ── what must not be re-worded ─────────────────────────────────────────

// Rewriting it would show the user a raw browser string AND file every upload
// the network cut as a bug: the classifier keys on the TypeError itself.
test("a cut upload passes through untouched, so it still reads as connectivity", async () => {
  const cut = new TypeError("Failed to fetch");
  const err = await migrationCall(
    "migration import",
    deps(() =>
      engineThat(async () => {
        throw cut;
      }),
    ),
    (engine) => engine.migrationImport("a1", new ArrayBuffer(0)),
  ).catch((e: unknown) => e);
  assert.equal(err, cut);
  const outcome = taskFailureOutcome(err, false);
  assert.equal(outcome.kind === "failed" && outcome.transport, true);
});

test("toMigrationError leaves a failure with no HTTP status alone", () => {
  const bug = new Error("agents is not iterable");
  assert.equal(toMigrationError("migration status", bug, COPY), bug);
});

// ── the resume probe ───────────────────────────────────────────────────

test("a pod with no status route reads as never imported", async () => {
  const marker = await nullOn404(async () => {
    throw new HoustonEngineError(404, { error: "not found" });
  });
  assert.equal(marker, null);
});

test("any other failing status still throws rather than reading as absent", async () => {
  await assert.rejects(
    nullOn404(async () => {
      throw new HoustonEngineError(500, { error: "boom" });
    }),
    (err: unknown) => err instanceof HoustonEngineError && err.status === 500,
  );
});

test("a marker the server holds comes back unchanged", async () => {
  const marker = await migrationCall(
    "migration status",
    deps(() => engineThat(async () => MARKER)),
    (engine) => nullOn404(() => engine.migrationStatus("a1")),
  );
  assert.deepEqual(marker, MARKER);
});
