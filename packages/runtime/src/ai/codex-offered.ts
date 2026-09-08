/**
 * What OpenAI's Codex backend actually serves a ChatGPT subscription.
 *
 * pi-ai's baked `openai-codex` catalog is a SUPERSET of what a ChatGPT account
 * can run: it still lists rows OpenAI stopped serving on
 * `chatgpt.com/backend-api/codex/responses`, and an unserved id is a dead turn
 * ("The model `gpt-5.5` does not exist or you do not have access to it.").
 *
 * Verified 2026-09-07 by POSTing a one-token request to
 * `https://chatgpt.com/backend-api/codex/responses` with Houston's own stored
 * `openai-codex` OAuth credential and the `originator: pi` header pi-ai sends:
 *   served  — gpt-6-astra, gpt-5.6-sol, gpt-5.6-terra, gpt-5.6-luna,
 *             gpt-5.4-mini, gpt-5.3-codex-spark
 *   refused — gpt-5.5 (404 `model_not_found`), gpt-5.4 (400 "not supported when
 *             using Codex with a ChatGPT account")
 *
 * A LIVE listing exists and Houston's credential is accepted by it — `GET
 * https://chatgpt.com/backend-api/codex/models?client_version=<codex-cli
 * version>`, the endpoint the Codex CLI caches into `~/.codex/models_cache.json`
 * — and it is deliberately NOT the source here, on evidence gathered the same
 * minute: it returned `gpt-5.5` as `visibility: "list"`, `upgrade: null` while
 * the responses endpoint 404'd that id, and it answers with an EMPTY list unless
 * the query names a Codex CLI version it recognises (`0.153.4` → 9 rows,
 * `0.85.1` → none). It is the CLI's picker list gated on a client version
 * Houston would have to impersonate forever, not a statement of what the
 * subscription accepts — a listing that is both wrong and fragile is worse than
 * a table whose evidence is written down.
 *
 * Re-verify with that probe whenever pi's catalog moves or a Codex turn fails
 * `model_unavailable`, and edit the set below.
 */

export const CODEX_PROVIDER_ID = "openai-codex";

/**
 * The Codex model every Houston surface starts on: OpenAI's current headline
 * row, served to the ChatGPT subscription and the id the Codex CLI itself
 * defaults to. Read by `config.codexModel`, which is what a turn PINNED to
 * `openai-codex` with no model resolves to.
 */
export const CODEX_DEFAULT_MODEL = "gpt-6-astra";

/** pi-ai catalog rows the Codex backend refuses for a ChatGPT account. */
const CODEX_UNSERVED_MODEL_IDS: ReadonlySet<string> = new Set([
  "gpt-5.4",
  "gpt-5.5",
]);

/**
 * Narrow pi's `openai-codex` catalog to the ids the subscription actually runs,
 * so the picker, the agent-facing tool enum and the pin validator never offer a
 * model whose only possible outcome is a `model_unavailable` turn.
 */
export function codexOfferedModelIds(catalogIds: readonly string[]): string[] {
  return catalogIds.filter((id) => !CODEX_UNSERVED_MODEL_IDS.has(id));
}
