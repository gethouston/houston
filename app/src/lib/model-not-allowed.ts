/**
 * The gateway's `model_not_allowed` rejection of a per-agent model-choice write
 * (`PUT /v1/agents/:slug/model-choice`, cloud `modelchoice.go`): the pick is
 * outside the agent's allowed-models ceiling. An EXPECTED business state, not a
 * Houston bug (PRODUCT-1734): the composer clamps its picker and its effort
 * re-write to the ceiling it last fetched, so the write only reaches this
 * rejection when a manager narrowed the ceiling under the user (the cached
 * ceiling is at most 30s stale) or when a choice stored before the narrowing is
 * re-sent by an effort click. The remedy is a re-fetch, which the mutation
 * already does on settle, plus a plain informational toast — never the red
 * "report a bug" pair.
 *
 * The Go edge answers the FLAT `{error: "<sentence>", code: "model_not_allowed"}`
 * shape, which `HoustonEngineError.code` (nested `{error: {code}}`) does not
 * read; `shareErrorCode` covers both. DOM-free so it unit-tests
 * (`app/tests/model-not-allowed.test.ts`).
 */

import { shareErrorCode } from "./share-via-team.ts";

export const MODEL_NOT_ALLOWED_CODE = "model_not_allowed";

/** True for a gateway `model_not_allowed` rejection of a model-choice write. */
export function isModelNotAllowedError(err: unknown): boolean {
  return shareErrorCode(err) === MODEL_NOT_ALLOWED_CODE;
}
