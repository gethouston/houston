import type { HoustonEngineError } from "@houston-ai/engine-client";

// `PATCH /agents/:id` has exactly one 409 path: AgentNameConflictError in
// packages/host/src/routes/agents.ts. A 409 from this call is therefore the
// expected "name already taken" business state, not a generic failure.
/** True when a rename collides with another agent in the workspace. */
export function isAgentNameConflictError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const engineError = err as HoustonEngineError;
  return (
    engineError.name === "HoustonEngineError" && engineError.status === 409
  );
}
