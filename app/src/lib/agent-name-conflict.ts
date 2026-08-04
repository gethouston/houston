// `PATCH /agents/:id` has exactly one 409 path: AgentNameConflictError in
// packages/host/src/routes/agents.ts. A 409 from this call is therefore the
// expected "name already taken" business state, not a generic failure.
// Two client stacks reach that route: the legacy adapter throws
// `HoustonEngineError`, the SDK write path (wave 2b) throws `AgentsHttpError`.
/** True when a create/rename collides with another agent in the workspace. */
export function isAgentNameConflictError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: unknown; status?: unknown };
  return (
    (e.name === "HoustonEngineError" || e.name === "AgentsHttpError") &&
    e.status === 409
  );
}
