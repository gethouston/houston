import assert from "node:assert/strict";
import { test } from "node:test";
import { engineErrorCode } from "../src/lib/engine-error-code.ts";
import { shareErrorCode } from "../src/lib/share-via-team.ts";

test("engineErrorCode reads the code out of every shape a host sends", () => {
  // The adapter's own classification.
  assert.equal(engineErrorCode({ kind: "offline" }), "offline");
  // The Go gateway's flat body.
  assert.equal(
    engineErrorCode({
      status: 402,
      body: { error: "upgrade", code: "needs_upgrade" },
    }),
    "needs_upgrade",
  );
  // The TS host's files routes.
  assert.equal(
    engineErrorCode({
      status: 409,
      body: { error: '"a.pdf" already exists there', code: "name_taken" },
    }),
    "name_taken",
  );
  // The nested `{error: {code}}` form.
  assert.equal(
    engineErrorCode({ body: { error: { code: "team_not_found" } } }),
    "team_not_found",
  );
  assert.equal(
    engineErrorCode({ code: "move_in_progress" }),
    "move_in_progress",
  );
});

test("engineErrorCode never passes an English sentence off as a code", () => {
  // The whole reason this reader exists: a code is matched against constants,
  // and a sentence that reworded (or got translated) would start matching
  // nothing — or, worse, the wrong state.
  assert.equal(
    engineErrorCode({ status: 409, body: { error: "name is taken" } }),
    undefined,
  );
  assert.equal(engineErrorCode(new Error("already exists there")), undefined);
  assert.equal(engineErrorCode("already exists there"), undefined);
  assert.equal(engineErrorCode(undefined), undefined);
  assert.equal(engineErrorCode(null), undefined);
});

test("shareErrorCode keeps its own sentence fallback for the C8 gateway", () => {
  // The share flow's step machine renders an unrecognized sentence as a
  // generic failure, so this degradation is safe THERE and nowhere else.
  assert.equal(
    shareErrorCode({ body: { error: "unsupported_move" } }),
    "unsupported_move",
  );
  // …and the shapes it shares with every other surface answer identically.
  assert.equal(
    shareErrorCode({ body: { code: "needs_upgrade" } }),
    "needs_upgrade",
  );
  assert.equal(shareErrorCode({ kind: "timeout" }), "timeout");
  assert.equal(shareErrorCode(null), undefined);
});
