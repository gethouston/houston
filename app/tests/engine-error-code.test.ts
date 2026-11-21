import assert from "node:assert/strict";
import { test } from "node:test";
import { engineErrorCode } from "../src/lib/engine-error-code.ts";
import { shareErrorCode } from "../src/lib/share-error.ts";

test("engineErrorCode reads the code out of every shape a host sends", () => {
  assert.equal(engineErrorCode({ kind: "offline" }), "offline");
  assert.equal(
    engineErrorCode({
      status: 402,
      body: { error: "upgrade", code: "needs_upgrade" },
    }),
    "needs_upgrade",
  );
  assert.equal(
    engineErrorCode({
      status: 409,
      body: { error: '"a.pdf" already exists there', code: "name_taken" },
    }),
    "name_taken",
  );
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
  assert.equal(
    shareErrorCode({ body: { error: "unsupported_move" } }),
    "unsupported_move",
  );
  assert.equal(
    shareErrorCode({ body: { code: "needs_upgrade" } }),
    "needs_upgrade",
  );
  assert.equal(shareErrorCode({ kind: "timeout" }), "timeout");
  assert.equal(shareErrorCode(null), undefined);
});
