import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { HoustonEngineError } from "../../packages/web/src/engine-adapter/client/errors.ts";
import { isAgentNameConflictError } from "../src/lib/agent-name-conflict.ts";

describe("isAgentNameConflictError", () => {
  it("matches a 409 HoustonEngineError from an agent rename", () => {
    strictEqual(
      isAgentNameConflictError(new HoustonEngineError(409, { error: "taken" })),
      true,
    );
  });

  it("rejects undefined, non-objects, and non-conflict engine errors", () => {
    strictEqual(isAgentNameConflictError(undefined), false);
    strictEqual(isAgentNameConflictError("409"), false);
    strictEqual(
      isAgentNameConflictError(new HoustonEngineError(400, { error: "bad" })),
      false,
    );
  });
});
