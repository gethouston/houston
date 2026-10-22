/**
 * What OpenAI's Codex backend actually serves a ChatGPT subscription.
 *
 * pi-ai's baked `openai-codex` catalog is a SUPERSET of what a ChatGPT account
 * can run: it lists rows OpenAI refuses on
 * `chatgpt.com/backend-api/codex/responses`, and an unserved id is a dead turn
 * ("The 'gpt-5.3-codex-spark' model is not supported when using Codex with a
 * ChatGPT account.").
 *
 * Verified 2026-09-23 by POSTing a one-token request to that endpoint for every
 * row of pi-ai 0.87.1's catalog, with the headers pi-ai sends (`originator:
 * pi`, `chatgpt-account-id`, `OpenAI-Beta: responses=experimental`, `accept:
 * text/event-stream`). The body carries NO `max_output_tokens`: the backend
 * rejects that parameter with a 400 of its own BEFORE it validates the model,
 * so a probe that sends it reads every id as refused. The credential was the
 * Codex CLI's own sign-in (`~/.codex/auth.json`) — the same OpenAI OAuth app
 * and the same ChatGPT account Houston's `openai-codex` credential holds,
 * reached for because Houston's local copy had expired.
 *   served  (200 `response.created`) — gpt-6-luna, gpt-6-sol, gpt-6-astra,
 *             gpt-5.6-sol, gpt-5.6-terra, gpt-5.6-luna, gpt-5.5
 *   refused (400 "… not supported when using Codex with a ChatGPT account")
 *           — gpt-5.3-codex-spark, gpt-5.4, gpt-5.4-mini
 *
 * Re-probed 2026-10-22 against pi-ai 1.4.0's catalog, same method:
 *   served  — gpt-6.1-sol, gpt-6-luna
 *   refused — gpt-5.5 (400 "… not supported when using Codex with a ChatGPT
 *             account"), which pi 1.4.0 dropped for the same reason
 *
 * pi 1.4.0 ships neither refused id, so the set below filters nothing today. It
 * stays because pi has carried refused rows before, and a stored pin on either
 * id must still fail as `model_unavailable` with a served switch target.
 *
 * A LIVE listing exists and Houston's credential is accepted by it — `GET
 * https://chatgpt.com/backend-api/codex/models?client_version=<codex-cli
 * version>`, the endpoint the Codex CLI caches into `~/.codex/models_cache.json`
 * — and it is deliberately NOT the source here. It answers with an EMPTY list
 * unless the query names a Codex CLI version it recognises (`0.153.4` → 9 rows,
 * `0.85.1` → none), and it disagrees with the responses endpoint: on 2026-09-07
 * it carried `gpt-5.5` as `visibility: "list"`, `upgrade: null` while a POST for
 * that id answered 404. It is the CLI's picker list gated on a client version
 * Houston would have to impersonate forever, not a statement of what the
 * subscription accepts — a listing that is both wrong and fragile is worse than
 * a table whose evidence is written down.
 *
 * Re-verify with that probe whenever pi's catalog moves or a Codex turn fails
 * `model_unavailable`, and edit the set below.
 */

export const CODEX_PROVIDER_ID = "openai-codex";

/**
 * The Codex model every Houston surface starts on: the cheapest row of the
 * gpt-6 line, so a subscription's allowance stretches across far more turns
 * than gpt-6-astra (100x cheaper per input token in pi's 0.87.1 catalog) while
 * staying on the current generation. Read by `config.codexModel`, which is what
 * a turn PINNED to `openai-codex` with no model resolves to.
 */
export const CODEX_DEFAULT_MODEL = "gpt-6-luna";

/** pi-ai catalog rows the Codex backend refuses for a ChatGPT account. */
const CODEX_UNSERVED_MODEL_IDS: ReadonlySet<string> = new Set([
  "gpt-5.3-codex-spark",
  "gpt-5.5",
]);

/**
 * Narrow pi's `openai-codex` catalog to the ids the subscription is known to
 * run, so the picker, the agent-facing tool enum and the pin validator never
 * offer a model whose only possible outcome is a `model_unavailable` turn.
 */
export function codexOfferedModelIds(catalogIds: readonly string[]): string[] {
  return catalogIds.filter((id) => !CODEX_UNSERVED_MODEL_IDS.has(id));
}
