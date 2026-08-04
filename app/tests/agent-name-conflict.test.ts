import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { HoustonEngineError } from "../../packages/web/src/engine-adapter/client/errors.ts";
import { isAgentNameConflictError } from "../src/lib/agent-name-conflict.ts";

// The real `AgentsHttpError` (packages/sdk/src/modules/agents/http.ts) uses a
// TS parameter property, which `--experimental-strip-types` refuses to load —
// mirror its wire-relevant shape (name + status) instead.
function agentsHttpError(message: string, status: number): Error {
  return Object.assign(new Error(message), {
    name: "AgentsHttpError",
    status,
  });
}

describe("isAgentNameConflictError", () => {
  it("matches a 409 HoustonEngineError from an agent rename", () => {
    strictEqual(
      isAgentNameConflictError(new HoustonEngineError(409, { error: "taken" })),
      true,
    );
  });

  it("matches a 409 AgentsHttpError from the SDK write path (wave 2b)", () => {
    strictEqual(
      isAgentNameConflictError(agentsHttpError('{"error":"taken"}', 409)),
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
    strictEqual(
      isAgentNameConflictError(agentsHttpError("missing 'name'", 400)),
      false,
    );
  });
});
