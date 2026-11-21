# Runtime models and providers: design decisions

Decisions and external constraints of `packages/runtime/src/ai`. Complements ADR 0006 (`0006-runtime-design-decisions.md`), which keeps the shorter summary; each section names the symbol it governs.

## Codex catalog evidence (packages/runtime/src/ai/codex-offered.ts)

`codexOfferedModelIds` uses completion probes as evidence of availability. The live `GET /backend-api/codex/models?client_version=...` listing is unsuitable: version `0.153.4` returned 9 rows while `0.85.1` returned none. On 2026-09-07 it listed `gpt-5.5` with `visibility: "list"` and `upgrade: null`, while a completion request returned 404. Depending on that listing would require maintaining a recognized CLI version without establishing which models actually run.

Acceptance probes POST to `https://chatgpt.com/backend-api/codex/responses`, using the headers pi sends: `originator: pi`, `chatgpt-account-id`, `OpenAI-Beta: responses=experimental`, and `accept: text/event-stream`. Omit `max_output_tokens`: the backend rejects that parameter with 400 before validating the model, making every model appear unavailable. A 200 `response.created` establishes acceptance. A Codex CLI credential uses the same OAuth application as Houston's Codex connection.

The recorded probe evidence is:

- On 2026-09-23, against pi-ai 0.87.1, accepted models were `gpt-6-luna`, `gpt-6-sol`, `gpt-6-astra`, `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`, and `gpt-5.5`. `gpt-5.3-codex-spark`, `gpt-5.4`, and `gpt-5.4-mini` returned 400 with the subscription's unsupported-model explanation.
- On 2026-10-22, against pi-ai 1.4.0, `gpt-6.1-sol` and `gpt-6-luna` were accepted. `gpt-5.5` returned the unsupported-model 400.
- On 2026-10-26, `gpt-6.1-terra` was accepted with efforts `none`, `low`, and `max`.
- On 2026-11-17, `gpt-6.2-sol` and `gpt-6.2-astra` were accepted with effort omitted and with `low`, `medium`, `high`, `xhigh`, and `max`. Explicit `none` and `minimal` returned 400 `unsupported_value`; `ultra` returned 400 `invalid_value`.

Recheck this evidence whenever pi's catalog changes or a Codex turn reports `model_unavailable`.

`CODEX_DEFAULT_MODEL` selects `gpt-6-luna` to stretch subscription allowance. Its input-token price in pi-ai 0.87.1 was one hundredth of `gpt-6-astra`'s, the recorded cost basis for that choice.

## First-byte deadlines and duplicate requests (packages/runtime/src/ai/first-byte.ts, packages/runtime/src/ai/hedged-stream.ts)

`firstByteDeadlineMs` measures response opening, before silent reasoning. Hosted providers open the response after reading the prompt, so prompt size must influence the deadline. The measurements behind the policy:

- On 2026-10-03, 44 Codex requests using small and 20k-token prompts measured p50 0.94 s, p90 1.1 s, and maximum 4.6 s.
- On 2026-10-03, 297 staging Claude turns measured first-model-event latency at p50 1.1 s, p99 5.0 s, and maximum 9.7 s. That event follows the first byte.
- On 2026-10-22, one production Claude session measured request-to-first-content latency, an upper bound on first-byte latency. Below 400k prompt tokens, p90 was at most 5.2 s. At 400k–600k tokens, p90 was 11.0 s and maximum 13.7 s. Above 600k tokens, p90 was 15.9 s and maximum 26.6 s. The maximum came from an 800k-token prompt with a cold cache.
- In the staging load test, 47 provider requests remained unanswered for 300 s, while pi's retry of each answered in about 40 s.

These observations justify the 15 s base deadline, three times the small-prompt p99, plus `MS_PER_PROMPT_TOKEN` at 50 ms per thousand tokens. The resulting deadlines are 35 s at 400k tokens, 55 s at 800k, and 65 s at 1M.

The Claude CLI uses one timeout for the entire turn. Its prompt estimate includes 100k tokens of expected growth, giving even an unsized turn at least 20 s.

Custom endpoints receive no first-byte deadline because loading a local model can take minutes before the server opens its response.

`hedgedStream` may send another unanswered request without duplicating tool execution. The unanswered attempt has produced no output, and pi executes a requested tool only after the response requesting it finishes. Only the winning attempt's events reach the agent loop.

## Azure deployment names (packages/runtime/src/ai/azure-openai.ts, packages/runtime/src/ai/provider-error.ts)

Houston's Azure connection requires a deployment named exactly after the model ID, such as `gpt-5.5`. pi's `resolveDeploymentName` defaults to that ID, and Houston's connection does not collect a separate deployment-name mapping.

`modelUnavailableReason` therefore preserves `DeploymentNotFound` as `not_deployed`. The remedy is to create the correctly named deployment. Merely suggesting another undeployed model repeats the same failure.

## Local endpoint reachability (packages/runtime/src/ai/endpoint-reachability.ts, packages/runtime/src/ai/provider-error.ts)

`fetchProbe` treats every HTTP response from `/models` as evidence that the server is reachable, including 401 and 404. Those responses establish that a server answered; credential, path, and model problems belong to the actual completion request. Only connection failures, name-resolution failures, and timeouts establish unreachability.

`isCustomEndpoint404` treats a completion 404 as an endpoint or model configuration problem. A reverse proxy may be serving the wrong path, an Ollama URL may lack `/v1`, or the configured model may need downloading. Reconnecting the credential or retrying unchanged cannot correct those conditions.

## Provider status and turn admission (packages/runtime/src/ai/providers.ts)

`providerHealth` reports exhausted quota through `health: "out_of_credits"` while `providerUsable` leaves `configured` true. The credential remains valid, and a turn must be able to reach the provider and show its own quota card. Quota exhaustion must not become a disconnected-provider refusal.

`activeProvider` uses configured credentials rather than the status-only health and reachability filters in `providerUsable`. A suspect connection must still be tried so its actual error reaches the conversation. A successful turn also supplies the evidence needed to clear an obsolete failure mark.

## Provider failure remedies and fallback ownership (packages/runtime/src/ai/provider-error.ts)

`isServerError` classifies Codex WebSocket closures and Envoy upstream connection failures as provider failures because those connections run between the runtime and the provider. On cloud deployments, telling the user to check their internet connection identifies the wrong connection. Retry is the appropriate remedy; a genuinely unavailable local network produces fetch or connection errors on the next attempt.

`isNvidiaFunctionGated` cannot use `/v1/models` as proof that an account may run a model. NVIDIA lists models that the same account's completion requests reject. Account-specific completion results, rather than catalog presence, determine availability.

`MOONSHOT_BROAD_FALLBACK` uses `kimi-k2.6` because `/v1/models` listed it even for an unfunded account. Models requiring a prior top-up, such as `kimi-k3`, cannot provide the same fallback.

`COPILOT_BASE_FALLBACK`, `CODEX_BROAD_FALLBACK`, `NVIDIA_BROAD_FALLBACK`, and `BEDROCK_BROAD_FALLBACK` deliberately duplicate their corresponding runtime defaults. Keeping these values local avoids importing configuration and catalog dependencies into the classifier. Changes to the defaults must update their classifier counterparts.

## Derived provider catalogs (packages/runtime/src/ai/qwen-dashscope.ts, packages/runtime/src/ai/xiaomi-endpoint.ts)

`qwenModels` derives Qwen-family entries from pi's Token Plan catalog because both products use the same Model Studio catalog. Remapping the provider and endpoint while preserving the remaining model fields keeps compatibility and thinking settings aligned with pi when its catalog changes.

`xiaomiOfferedModelIds` uses the Singapore Token Plan table for all three regional gateways because their model catalogs are identical. The Singapore table represents the shared plan offering.

## Account usage and token accounting (packages/runtime/src/ai/usage/anthropic.ts, packages/runtime/src/ai/usage/copilot.ts, packages/runtime/src/ai/usage/ledger.ts)

`resolveAnthropicToken` skips the shared credential file and macOS Keychain for a personal credential scope. Those sources hold team material. A member's usage must come from that member's scoped `auth.json` credential.

The relayed branch of `fetchCopilotUsage` forwards `x-houston-acting-as` to the host. Without the same acting identity used for credential serving, the host could return the team's quota for a member using a personal account.

`recordTokenSpend` counts cache-inclusive `context_tokens`. Repeated prompt content contributes again across recorded turns because the counter measures supplied prompt volume, rather than distinct conversation content or only uncached input.
