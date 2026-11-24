# Runtime (packages/runtime): design decisions

Decisions and external constraints moved out of code comments in `packages/runtime`. Grouped by area. Each section names where the rule lives.

## Models and providers (src/ai)

### Provider failures are classified from pi's errored message, not from a throw
pi does not throw on a provider failure: the agent loop resolves the turn with an `AssistantMessage` whose `stopReason` is `"error"` and whose `errorMessage` holds the verbatim provider text. The classifier reads that text (plus any status pi surfaced via diagnostics) and maps it to the typed `ProviderError` union so the chat renders the matching card. Lives in `src/ai/provider-error.ts` (`classifyProviderError`).

### Classification precedence
Auth is checked first (a 401 or a session-kill is unambiguous), then per-provider model gates, the Azure missing-endpoint case, credit exhaustion, context overflow, model unavailable, rate limit, server and network failures, and finally `unknown`. A known non-auth status (400, 422, 5xx) is never read as auth, so loose words such as "authentication" or "oauth" in its body cannot trip a reconnect card. A 401 is always auth; a 403 counts as auth only when the body names an auth failure, because Anthropic uses 403 `permission_error` for authorization, which re-login does not fix. On a 400, only wording that names the key itself (`INVALID_KEY_PATTERNS` subset) is trusted, because xAI answers a bad key with 400. `src/ai/provider-error.ts` (`classifyProviderError`, `isAuth`).

### Vendor-specific error shapes the classifier must read
Each shape below was taken from a verbatim provider response; the pattern exists because the generic patterns missed it. `src/ai/provider-error.ts` pattern constants.
- opencode.ai overloads HTTP 401 for non-auth failures (`CreditsError` "Insufficient balance", `ModelError` "Model <id> is not supported"); these must not read as auth.
- ChatGPT answers a deactivated workspace with the bare `{"detail":{"code":"deactivated_workspace"}}`, no status and no prose.
- Alibaba Model Studio writes "API-key" hyphenated (`invalid_api_key`); NVIDIA NIM answers a bad key with 403 "Authorization failed"; Gemini blocked projects answer 403 `PERMISSION_DENIED`.
- Model-gate bodies that prove the key authenticated: Copilot `model_not_supported` and the newer "not available for integrator" prose, together.ai "Unable to access model", Azure `DeploymentNotFound` (Azure answers 401 before any deployment lookup), Bedrock on-demand throughput and off-region profile rejections, opencode.ai `RegionError`, Moonshot "Not found the model", Xiaomi "Not supported model", Qwen `AccessDenied.Unpurchased`, MiniMax "unknown model '<id>' (2013)", OpenRouter "No endpoints found for" and "is not a valid model ID", Vertex "Publisher model ... was not found".
- Credit exhaustion: opencode `CreditsError`, Vercel AI Gateway `customer_verification_required`, Together 402 spending limit, Anthropic "credit balance is too low" (arrives as 400, so the 402 short-circuit misses it), DashScope `AllocationQuota.FreeTierOnly`, NVIDIA expired cloud credits, Google billing dunning 403. A spent plan allowance (OpenAI `insufficient_quota` on HTTP 429) is credit exhaustion, not a rate limit; "quota" scoped to a per-minute window stays a rate limit.
- Rate limits: Bedrock "Throttling error: Too many tokens" (matched before overflow), gRPC `ResourceExhausted` (NVIDIA per-worker concurrency).
- Transient server failures: opencode "Streaming response failed", OpenRouter `finish_reason: "error"` and streams closed with no finish reason, gateway `network_error`, Gemini `UNAVAILABLE` with the status inside nested JSON, Gemini `MALFORMED_FUNCTION_CALL`/`MALFORMED_RESPONSE`, Harmony-format header errors from gpt-oss on NIM, Codex `WebSocket closed <code>` (1006, 1000, 1012), Envoy "upstream connect error" and "Upstream idle timeout exceeded", OpenAI's generic "An error occurred while processing your request", undici's bare `terminated`.
- Gemini policy stops share the `Provider stopped with:` prefix but are refusals; retry does not help.
- Context overflow uses pi-ai's per-provider patterns plus OpenAI's hard 10,485,760-character cap on a single content string.

### Status extraction from error text
Status is pulled from the two shapes pi emits, parenthesized (`OpenAI API error (429)`) and leading (Anthropic SDK `401 {...}`), plus the OpenAI SDK's `<status> status code (no body)` even when pi's compaction prefixes it, the Claude Agent SDK's "API Error: 401" text, and as a last resort a JSON `"code"` field (Google, often double-encoded). A three-digit number that is not a plausible HTTP status is ignored. `src/ai/provider-error.ts` (`extractStatus`).

### Retry-after parsing
Reads an echoed `retry-after` value and the human phrasings providers emit ("try again in 2.5s", "resets in 30 seconds", millisecond forms). Sub-second waits round up to 1 s; values are capped at 24 h so a bogus value cannot drive an absurd countdown. `src/ai/provider-error.ts` (`extractRetryAfterSeconds`).

### Switch targets on model_unavailable cards
A card offers a one-click switch only when a broadly served model is known for the provider and it is not the failing model (offering it back would loop). Targets: the cheapest model every paid Copilot plan serves, a Codex model the subscription runs, a NVIDIA model served to every account seen, the broadest Kimi model, `mimo-v2.6-pro` (in every Xiaomi catalog), the Bedrock `global.` cross-region profile, and for a custom endpoint the one model it serves. A provider without evidence gets no target: a guess that fails again is worse than a card that only names the dead model. Without a model id the error degrades to `unknown`. The custom endpoint provider id is duplicated in the classifier on purpose so it stays pure (the owning module pulls in fs and config). `src/ai/provider-error.ts`.

### NVIDIA per-account model gate
integrate.api.nvidia.com serves each hosted model per account; an account can lack the whole "Public API Endpoints" permission or individual functions. A 404/410 "Not found for account" proves the key and means switch model. `src/ai/provider-error.ts` (`isNvidiaFunctionGated`).

### Credential scope stamped on provider errors
After classification the error is stamped with which credential the gateway served for the acting identity, so the card can name the account that hit the limit. `src/ai/provider-error.ts` (`stampCredentialScope`).

### Provider error log line is a contract
Every backend logs the verbatim provider text exactly once, after classification, through one function. The line format `[provider_error] provider=X model=Y status=Z[ error=SLUG] kind=K[ cause=C] :: text` is parsed by the Sentry capture regex in the runtime client (`PROVIDER_ERROR_LINE`), which turns `cause=` into a tag. Expected external states (429, 503, exhausted quota, overflow, user-org states such as `deactivated_workspace` or an org policy block) log as warnings because the chat already renders a card and no Houston change can prevent them. An `AbortError` from a Stop or dropped client is not a provider failure. pi's own auto-retries of transient failures are logged so the log shows the retry. `src/ai/provider-error-log.ts`.

### Status-less failures pi already retried
Patterns mirror pi-ai's retry list (`provider returned error`, `service unavailable`, gateway `response.failed` snake_case codes, node-fetch errors with an empty reason from Vertex ADC refresh). A failure reaching the classifier with these means pi's retries ran out, so it is a server outage. Only snake_case codes are used, never pi's looser `upstream request failed`, because that also wraps "model not found". A named network reason such as `ENOTFOUND` stays `network_unreachable`. `src/ai/provider-error-busy.ts`.

### Terse Codex refusals borrow an earlier explanation
ChatGPT's Codex gateway sometimes refuses with a terse body (`{"detail":"Bad Request"}`, a bare `Not Found`, an HTML page) after explaining the same refusal fully moments earlier. An explained plan gate or usage limit is remembered per (acting identity, model) for 30 minutes (long enough to cover a routine cycle, short enough that a plan upgrade is not misread for long), in a small bounded map; pi's last auto-retry text in the same turn is checked first; a persisted mark survives pod restarts but carries no reset instant. A remembered usage limit also honours its own `resets_at`. `src/ai/codex-terse-refusal.ts`, `src/ai/codex-refusal-persisted.ts`.

### Model resolution never throws on a stale saved id; pins are validated
pi-ai's `getModel` returns undefined for an id the provider does not offer. A saved (unpinned) id that went stale falls back to the provider default so the turn runs a real model. A pinned id (routine, managed ceiling) is never auto-corrected but is validated: an unknown pin throws a typed `ModelNotOfferedError` so the chat shows a switch-model card. A retired Claude id runs its family's lineup model, pinned or saved, because it is the same choice. A provider without a pi catalog has nothing to validate against. `src/ai/providers.ts` (`safeGetModel`, `resolveModel`).

### Catalog narrowing per provider
- Codex: pi's `openai-codex` catalog is a superset of what a ChatGPT subscription runs; refused rows answer `model_not_found`. The offered set is pi's catalog minus probed refusals, derived from pi so a pi bump surfaces new rows. The default is the cheapest GPT-6 row so the allowance stretches further. Some served ids are hidden from pickers only, so stored pins on them still run. `src/ai/codex-offered.ts`.
- Anthropic: narrowed to the domain-owned Claude lineup (`ANTHROPIC_LINEUP`), one model per family, in picker order. `src/ai/anthropic-lineup.ts`.
- MiniMax: retired M2.7 rows pi still lists run the default. `src/ai/minimax.ts`.
- Xiaomi Token Plan gateways serve a subset of the general catalog. `src/ai/xiaomi-endpoint.ts`.
- The `[1m]` suffix is a Claude Code client suffix, never a wire id.

### Providers come from pi-ai's live registry
pi-ai is the catalog source of truth. Any provider id pi knows (about 35, drifting) is connectable and resolvable, plus Houston's own `qwen` extension provider, which every read treats like a builtin. Auth method: a curated entry keeps its declared method; an uncurated provider is OAuth only when pi lists it as OAuth-only (providers with both auth kinds, such as xai or openrouter, accept pasted keys). The api-key provider set is the runtime mirror of the host's `isApiKeyProvider` connect gate. Uncurated providers default to the domain table's hand-picked model, else the first model pi lists. `getModel`/`getModels` are read through pi-ai's `/compat` legacy static catalog because the newer API needs an instantiated registry the runtime does not otherwise carry. `src/ai/pi-catalog.ts`, `src/ai/providers.ts`.

### Provider selection is sticky
A saved provider is used when connected and yields null when logged out; the turn then shows a reconnect card instead of silently answering on another connected provider. Only when nothing is saved does the first connected provider (curated registry order first, then pi extras) serve. Connecting a provider is not a model pick: a connect claims the active provider only when the agent resolves to nothing, so pasting an OpenCode key while chatting on Codex does not move the agent. The OpenCode Zen and Go gateways share one key, so the claim policy treats the sibling as the same connect. `src/ai/providers.ts` (`pickActiveProvider`, `pickClaimedProvider`).

### Wire id canonicalization
The UI renames pi's `openai-codex` subscription to `openai` and never offers pi's platform-key `openai`, so a wire pin of `openai` is canonicalized to `openai-codex`. Run histories show the canonical id. `src/ai/providers.ts`.

### Status surface semantics
`configured` on `/providers` means configured and currently able to serve a turn: a credential that already failed `unauthenticated` (credential health) or an account marked out of credit reads not usable. The reason is reported in the order the user must act on (no credential, rejected credential, out of credit). Curated providers always appear; an uncurated pi provider appears once it has a stored credential. The OpenAI-compatible provider counts as configured only when its endpoint is set, since keyless servers store a placeholder key. `src/ai/providers.ts`.

### Agent-facing provider choices match the picker
The choice list given to agents is the same rows the `/providers` route serves, so "connected" means one thing. An empty catalog is the open-catalog signal (a gateway that forwards any id). `src/ai/provider-choices.ts`.

### Per-user endpoints overlaid onto catalog models
- Azure is the one catalog provider whose base URL is per resource; pi ships it with `baseUrl: ""` and its client throws without one. The connect-time endpoint is persisted beside settings (never the key), validated as https (the portal only issues https; http would send the key in clear), and on Azure-owned hosts the path is dropped because pi appends `/openai/v1`. An endpoint arriving on a served credential's `enterpriseUrl` slot is persisted too; an unchanged value is not rewritten because store-sync watches mtime. pi 1.0.3 renamed the provider to `azure`; Houston keeps the old id everywhere. `src/ai/azure-openai.ts`.
- Xiaomi runs two key families on distinct hosts: pay-as-you-go `sk-` keys on the general endpoint, Token Plan `tp-` keys only on their plan's regional gateway. Probe order starts on the plan gateways for `tp-` keys (Singapore before Amsterdam) to skip a guaranteed 401. The verified endpoint is overlaid onto every model because pi bakes the general URL. `src/ai/xiaomi-endpoint.ts`.
- Qwen: Houston's `qwen` provider targets Alibaba Model Studio's international pay-as-you-go DashScope API (pi ships only the Token Plan gateways). Keys are region scoped; the verified region (Singapore default) is persisted beside settings and the provider is re-registered so the next turn dials it. Models are derived per call so a region change is never stale. pi 0.82+ dispatches strictly by registered provider id. `src/ai/qwen-dashscope.ts`, `src/ai/qwen-region.ts`.

### OpenAI-compatible (local) endpoints
The model is hand-built (not a pi provider): zero cost because local inference is free; `developer` role and `reasoning_effort` disabled unless reasoning, because most servers reject them. Every endpoint write re-syncs the runtime's provider registration. A turn pinned to a model the endpoint does not serve fails with a local-override error rather than being mis-routed. Reachability is probed against `/models` with a tight timeout (the status route awaits it), cached per base URL with a short TTL, concurrent polls share one probe, and the verdict is optimistic before the first probe so a working server never flashes as down. Credentials for the local-model bridge are captured inside the turn's async subtree, never at provider registration. A bridge readiness verdict belongs to one authenticated context only. `src/ai/openai-compatible*.ts`, `src/ai/endpoint-reachability.ts`, `src/ai/local-model-transport.ts`, `src/ai/bridge-readiness.ts`.

### Reasoning effort
Houston's vocabulary is `low | medium | high | xhigh | max`; "max" is normalized to backend-neutral "xhigh" and the pi backend restores "max" for models that serve max instead of xhigh. A reasoning-capable model with no chosen effort gets `DEFAULT_REASONING_EFFORT`, because pi enables reasoning only when a level is set. `src/ai/effort.ts`.

### First-byte deadline and request hedging
A provider reads the whole prompt before its first byte (on one Claude session, prompts past 600k tokens took up to 26.6 s), so the deadline scales with prompt size: a base plus per-thousand-token allowance. When a request's response has not opened within the deadline (pi's `start` follows the HTTP headers or first WebSocket event), another attempt goes out without cancelling the first; the first to open wins and the rest are cancelled. A bounded number of extra attempts; the unanswered window adds a third of a deadline so the last attempt still gets its full deadline. A request in pi's provider-level retry sleeping out a 429 is not silence and is never hedged. The Claude Code CLI's own request timeout uses the same deadline. Prompt size is the last answered request's measured usage plus pi's character estimate of what was appended. `src/ai/first-byte.ts`, `src/ai/hedged-stream.ts`, `src/ai/hedged-runtime.ts`, `src/ai/prompt-tokens.ts`.

### Turn target diagnostic
Every turn logs one `[turn]` line with the provider, model and base URL it actually runs on after the pin is applied (the base URL disambiguates gateways such as OpenCode Go). A request with no pin and no connected provider is refused by the route and logs nothing. `src/ai/turn-diagnostic.ts`.

### Account usage probes
- Claude: Anthropic's OAuth usage API (the surface Claude Code's `/usage` reads), with a Claude Code user agent; the token is resolved like the desktop shell does (credentials file, then the macOS Keychain CLI, where exit 44 means absent, then auth.json). `src/ai/usage/anthropic.ts`.
- Codex: `chatgpt.com/backend-api/wham/usage`; windows are classified by length (up to a day is the session lane, longer is weekly), not position. `src/ai/usage/codex.ts`.
- Copilot: `api.github.com/copilot_internal/user` with the long-lived GitHub token pi stores as `refresh`. In serve mode the token was scrubbed, so the probe delegates to the host's central probe for the acting identity. Token-billing seats return placeholder zero quotas, which are dropped. Bare `quota_reset_date` dates read as midnight UTC. `src/ai/usage/copilot.ts`.
- OpenRouter and DeepSeek prepaid balances; a missing field is a probe failure, never a $0 balance. `src/ai/usage/credits.ts`.
- Providers with no account API (Gemini, Bedrock, OpenCode, MiniMax, custom endpoints) read a local token-spend ledger; a corrupt ledger reads as null rather than wedging the usage route. `src/ai/usage/ledger.ts`.
- A window whose reset instant has passed has rolled over and reads empty, because the API keeps reporting the previous window. `src/ai/usage/types.ts` (`settleWindow`).

## Process, config and boot (src/config.ts, src/main.ts)

### One runtime is one workspace, two modes in one binary
A runtime instance serves one workspace and one working directory. `HOUSTON_MODE=server` (default) is the long-lived per-workspace HTTP server with an in-memory event bus (desktop, self-host, per-agent pods); `HOUSTON_MODE=turn` is the stateless per-turn cloud worker that hydrates the agent's store prefix, runs, and syncs back. The working directory is created at boot because pi reports "Path not found" for every file tool on a fresh volume. `src/config.ts`, `src/main.ts`.

### Provider default models come from the domain table
A turn pinned to a provider with no model runs the domain table's default (`@houston/domain/provider-default-models`), the same values the app picker pre-selects and the on-disk migration writes, overridable per deployment by env. Codex is the exception: its default comes from `ai/codex-offered.ts`, which owns the probe of what a ChatGPT subscription serves. `src/config.ts`.

### Zero disables the stall watchdog
`HOUSTON_STALL_TIMEOUT_MS=0` must disable the watchdog, so the env read is not `Number(env.X || default)` ("0" is falsy and would restore the default). The window has to leave room for a silent reasoning phase (300 s cut a live gpt-6-astra reasoning phase) while still bounding a dead stream. `src/config.ts`.

### Turn workers never hold the code sandbox address
In turn mode the gateway serves `/v1/code/run` under the turn grant, so a worker gets no sandbox URL or credentials. Server mode and self-host call the sandbox directly. The `run_code` budget is per workspace in server mode and per worker in turn mode. `src/config.ts`, `turn/turn-run-code-limiter.ts`.

### Session and parse cache bounds
The conversation cache is capped (each session holds a backend session with its own transcript) and idle sessions are disposed after a window even under the cap. The parsed-conversation cache is bounded by the sum of cached files' on-disk sizes, because a parsed transcript costs one to two times its file size. The engine reserves part of the container memory limit for itself; the rest is the per-process cap on anything the model spawns. `src/config.ts`, `src/lru.ts`, `store/conversation-parse-cache.ts`.

### Local OpenAI-compatible default window
Local servers (Ollama, vLLM, LM Studio) do not advertise a context window pi can read, so an assumed default applies when the user sets none. An overflow rejection that names a smaller window lowers it; nothing can prove a larger one and a user-set value is never raised. `src/config.ts`, `src/ai/openai-compatible.ts`.

### Pool worker boot order and fencing
- A pool worker logs to stderr only, because its emptyDir is shared across the tenants it serves. Long-lived servers append to `<dataDir>/runtime.log`, which the host log viewer reads. `src/observability/logging.ts`, `src/main.ts`.
- Model commands run as an unprivileged tool user (`HOUSTON_TOOL_SHELL`) that shares only the group of the turn tree, so it cannot read the runtime's memory or environment. `src/tool-shell-config.ts`, `src/main.ts`.
- Local bash on a turn worker is allowed only on a single-use pod; an explicit `HOUSTON_CODE_EXECUTION=local` without `HOUSTON_POOL_SINGLE_USE` fails boot. A single-use worker without `HOUSTON_POD_UID` (from the downward API, never self-reported) fails boot because it would accept turns minted for a previous incarnation. `src/main.ts`, `src/turn/single-use.ts`.
- A restarted container in a spent single-use pod idles unregistered until the control plane replaces the pod; this is a normal lifecycle state, logged at info. The spent marker's writability is proven at boot so the restart guard cannot be a silent no-op. `src/main.ts`.
- Register before listening: `start()` blocks until the first heartbeat commits a fresh `bootId`, which clears any stale admission the control plane holds for this ordinal from a replaced pod. `src/main.ts`.
- Shutdown: the draining heartbeat must land before registration stops, or `stop()` aborts the request that tells the gateway to route elsewhere. A registered pool worker keeps serving its in-flight turn until the response ends; other runtimes drain turns within their budget with the listener up. A single-use worker exits after its one turn without a kubelet SIGKILL backstop, so it bounds its own exit. The transcript shadow queue gets a bounded drain at shutdown because its pending sends are in memory only. `src/main.ts`.
- Uncaught errors still crash the process but reach Sentry and stderr first. Crash reporting is dormant without `SENTRY_DSN`; the capture hook is a method reference so no main.ts frame lands on top of synthetic stacks. `src/main.ts`.

## Credentials (src/auth)

### Connect-once and Gate #2: the runtime never holds a refresh token
In managed cloud the subscription credential lives centrally; the runtime pulls a short-TTL access token per turn, authenticated by the control-plane-issued sandbox token. A served OAuth credential is always written to auth.json with `refresh: ""`; an API key is written as pi's `api_key` variant. After a local OAuth connect the host captures the full credential centrally and then calls `POST /auth/scrub-refresh`, which strips the refresh token for exactly that provider so a concurrent connect's refresh survives. `src/auth/auth-file.ts`, `src/auth/serve.ts`, `src/auth/serve-scrub.ts`.

### Per-identity credential files on shared pods
One pod serves every member of a team space, so credentials are scoped by acting identity. The team scope keeps `<dataDir>/auth.json` (same path and bytes as before scoping, so desktop and self-host are unchanged); a member's files live under `auth-users/<hash>`, the hashed scope key so the user id never lands on disk. A malformed key is a hard error, never a fallback to the team file. The Claude CLI's credential store for a personal scope is a sibling directory passed as `CLAUDE_SECURESTORAGE_CONFIG_DIR`. File modes 0700/0600 only keep other Unix users out. `src/auth/auth-file.ts`, `src/auth/serve-context.ts`.

### Credential store semantics
Houston's store implements pi-ai's `CredentialStore` over auth.json plus a synchronous `get/has/set/remove/reload` surface for sync turn paths. Writes per provider are serialized in a `modify` chain; the scope is resolved when work is queued and bound to it, so a continuation writes the file of the caller that queued it. `undefined` from a modify leaves the entry unchanged. The chain tail never carries a rejection forward. Deletes queue behind in-flight refreshes so a late refresh cannot undo a logout. The team file is read at construction so the desktop's sync path has a warm cache. `src/auth/credential-store.ts`, `src/auth/login.ts`.

### Empty refresh tokens never leave the process
pi's refresh closures POST `current.refresh` to the provider; an access-only entry is masked to `undefined` before pi sees it, and an access-only entry inside pi's validity floor (`DEFAULT_OAUTH_MINIMUM_VALIDITY_MS`) is first re-served centrally through serve.ts's single-flighted sync. The guard cannot import serve.ts (cycle through storage.ts), so serve.ts binds itself when it loads; an unbound guard reports a wiring fault after a short grace. `src/auth/empty-refresh-guard.ts`.

### Serve sync: provenance, retries, and dedup
- Every hydrating route and turn start probes every known provider against the control plane. Probes run through a small worker pool (about 40 concurrent sockets from a just-woken pod caused transient failures), each with a timeout and one retry after a short backoff; the first failure is a warning breadcrumb.
- Only a 404 carrying the host's not-connected marker is an authoritative logout; a bare 404 (old host, wrong URL, route miss) never deletes. A second marker means anthropic is never served on this deployment (desktop, self-host).
- An authoritative not-connected may only remove providers this runtime learned from serve mode (the served-providers manifest). A refresh-bearing entry is a device-code connect mid-capture and survives.
- A refresh-bearing local entry whose access token the central store serves back means the capture landed but the scrub was lost: the sync finishes the scrub.
- A served google "API key" that is OAuth material (`ya29.`, `eyJ`) can never authenticate; it is refused, any applied copy dropped, and the dead row reported by digest once per (scope, provider, token) per pod lifetime.
- Anthropic keeps a second credential copy, the SDK's `.credentials.json`; when the central row is gone it is removed too.
- After a direct write the in-memory store is reloaded, which is what makes a never-connected agent see the served credential.
- Host error bodies echo the provider id, so details are normalized before dedup. Failures sharing one detail in a sweep are one incident; a sweep where every probe fails identically means the control plane is unreachable. Dead central credentials and network-path failures are user or network states, not engine incidents.
- The served row's scope verdict is recorded on the gateway's answer; a pre-scoping gateway's answer reads as team.
`src/auth/serve-sync-run.ts`, `src/auth/serve-probe.ts`, `src/auth/serve-log.ts`, `src/auth/served-key-guard.ts`, `src/auth/capture-settlement.ts`, `src/auth/served-scope.ts`.

### Export for central capture
Capture is provider-specific: exporting a different provider that happens to come first would store the wrong credential. A refresh-less OAuth entry is never exported (it dies at first expiry). An api_key entry listed in the served manifest is a projection of a central row and is not re-exported by the healer, while a user-initiated capture always exports. Azure's endpoint is exported beside its key. `src/auth/export.ts`.

### Revoked-token reports
A revoked token looks present and unexpired, so the control plane would keep serving it. The runtime reports a revocation only when the provider's own words confirm it (`revocation-markers.ts`; the bare word "revoked" is not enough), only for OAuth store entries from serve mode, and names the token by the digest captured at request preparation for the failed turn (the file may have rotated since). Reports dedupe per (scope, provider, token) per pod, carry the acting token so the gateway deletes the member's row, never ship the token, and time out. serve mode is read from config directly because importing serve.ts here broke the engine bundle. `src/auth/report-revoked.ts`, `src/auth/used-token.ts`.

### Credential health marks
Some credential deaths are invisible on disk. A turn that fails auth marks the credential's fingerprint; a turn that runs out of quota marks the account (with the provider's reset instant, or a default hold). Marks heal when the credential changes, when a turn completes, or when the reset passes. Marks persist under the data dir so a restarted pod does not report a dead credential as connected; a missing or garbled file means nothing is known. Anthropic's fingerprint spans the shared-dir credentials file; the OpenAI-compatible fingerprint includes the endpoint. `src/auth/credential-health.ts`, `src/auth/provider-marks.ts`, `src/auth/credential-fingerprint.ts`.

### Stored credential usability
An access-only serve entry is usable only until it expires; OAuth with a refresh token is usable past expiry; API keys never expire; `expires` 0 means no expiry recorded; unknown variants are not vouched for. A pasted key is a real connection even when an ambient env key would also resolve. `src/auth/storage.ts`.

### API key verification before storing
A pasted key is stored only after a one-token completion with the candidate key proves it authenticates. Kinds that prove acceptance: rate limited, out of credit, model gated, context overflow. Google keys are verified against the models-list endpoint (completion probes failed on Google's "high demand" 503) with the key in a header, never the query string. Azure's endpoint rides `env` because pi's `buildBaseOptions` drops `azureBaseUrl`. Region or endpoint scoped providers (Qwen, Xiaomi) probe every candidate and persist the accepting one; if any candidate gave no verdict the answer is "try again", never "paste again". NVIDIA retries broadly served fallback models before a verdict. Hugging Face's missing-permission 403 has its own verdict. Abort and timeout exceptions get human text. `src/auth/verify-api-key.ts`, `src/auth/qwen-verify.ts`, `src/auth/xiaomi-verify.ts`, `src/auth/nvidia-verify.ts`, `src/auth/huggingface-verify.ts`, `src/auth/verify-errors.ts`.

### Keyless local servers
Ollama, LM Studio and vLLM ignore the Authorization header but pi requires some key, so a blank key becomes a placeholder. `src/auth/login-keys.ts`.

### OAuth login flows
- Codex browser login binds pi's fixed callback port 1455 (`REDIRECT_URI`) on `PI_OAUTH_CALLBACK_HOST`. pi swallows `EADDRINUSE`, which left users on a long spinner, so the port is preflighted first, after the idempotent reuse check (an in-flight login already holds the port). The flow is chosen only by `deviceAuth`: desktop uses loopback, remote web clients use device code. `src/auth/codex-port-preflight.ts`, `src/auth/login-policy.ts`, `src/auth/login-start.ts`.
- Copilot's pi login opens with an optional GitHub Enterprise domain prompt, auto-answered from the Enterprise card; other providers' prompts are manual pastes that wait for the user. `src/auth/login-policy.ts`.
- In-flight logins are keyed by credential scope and provider, so one member never receives another's device code. An abandoned flow holds the fixed callback port forever, so logins expire (logged at warning) and are torn down like a cancel; a repeat connect near the deadline refreshes the window. The timeout sentinel mirrors `PROVIDER_LOGIN_TIMEOUT_ERROR` in `@houston-ai/core` by value (the runtime cannot import it), checked by `app/tests/provider-login-error-sentinels.test.ts`. A GitHub account without Copilot maps to a fixed sentinel; its raw 403 carries the GitHub handle and must not reach the crash feed. `src/auth/login-state.ts`, `src/auth/login-start.ts`.
- The host's idle probe reports whether any sign-in waits on its user, because a flow lives only in this process. `src/auth/login.ts`.
- `ModelRuntime.login` also refreshes the network catalog outside the abort signal; completion depends only on the provider flow and credential write. `src/auth/login-drivers.ts`.

### Anthropic connect
The direct OAuth PKCE replay was replaced by two sanctioned paths: a pasted setup token or console key (`sk-ant-`), stored as `api_key`, with the Console API-keys page as the help URL and copy that never tells the user to run a CLI command (older clients show it verbatim); and a subscription login driven by the bundled Claude Code CLI running next to the runtime. The CLI path falls back to the paste flow when no CLI can run (logged with every probe failure) or it dies before surfacing the authorize URL. The CLI hyperlink-wraps its URL (OSC 8) even on a pipe, so the sequences are stripped. On macOS the CLI writes the credential to the Keychain under a service derived from the exact `CLAUDE_CONFIG_DIR` string; after storing in auth.json every Keychain and directory copy is destroyed, because each holds a refresh token. On hosts that never serve anthropic back, the CLI credential stays in the shared login dir as the single holder. The per-platform binary is resolved from the SDK's own directory because pnpm isolates it as the SDK's dependency. A personal sign-out never clears the shared Claude dir, which is team material. `src/auth/anthropic-*.ts`, `src/auth/login.ts`.

### Claude plan hint
The gateway serves a plan with an access token; it is bound to that token's digest. Only personal plans (Pro, Max) are passed to the CLI as `CLAUDE_CODE_SUBSCRIPTION_TYPE`, because the CLI skips organization managed-settings and policy fetches for them. `src/auth/claude-plan.ts`.

### LRU for conversation caches
A long-lived runtime opens an unbounded number of sessions; the LRU caps unpinned entries and optionally expires idle ones. Pinned entries (in-flight turns) are never evicted, and a pin wins over the size bound. `src/lru.ts`.

### Discoverability eval
Fixtures are everyday phrasings of what a person asks for, never the operation's own vocabulary, plus requests Houston must refuse. The CI half checks the capability map covers the whole callable surface by whole-name match; the model half (`pnpm eval:assistant`) asks a real model. Written after the assistant told a user an existing operation was impossible. `eval/`.

## Transcript store (src/store)

### One JSON file per conversation, atomic writes, parse cache
A conversation is one JSON file under `<dir>/<id>.json`, written by atomic swap so no half-written file exists. Every writer goes through `save` so the parse cache stays coherent. Reads go through a cache validated by mtime and size (cloud store-sync and manual edits write files directly); a hit costs a stat instead of a JSON.parse on the event loop. The cache is bounded by summed on-disk bytes; list summaries (five scalars per conversation) are cached separately and outlive the parsed transcript, so the list route never re-parses. After `save`, the cache is stamped with what was written. `src/store/conversation-file.ts`, `src/store/conversation-parse-cache.ts`, `src/store/conversation-queries.ts`.

### Optional fields are omitted, never written as undefined or empty
`author`, `mentions` and similar fields are omitted entirely when absent or empty, so a single-user transcript stays byte-identical to the pre-feature format. `displayText` is presentation only; the model runs on `content`. Assistant metadata (`pendingInteraction` only on clean turns, stop marker, interrupted marker set only by the boot settle, files changed, reasoning) is persisted so a reload renders the same state. `src/store/conversation-file.ts`, `src/store/conversation-message-meta.ts`.

### Transcript archiving
A conversation that never ends (a shared routine chat runs for months) would be re-parsed and rewritten whole on every append. Past a size threshold, older messages rotate into immutable segment files; the live tail keeps comfortably more than the replay preamble budget (about 0.8 of a 200k window, roughly 640 KB of text), opens at a user message so a turn is never split, and is never left empty. Segment first, live file second. A transcript that outgrew the budget before rotation existed rotates on first load. Indexes are absolute across segments and tail. Parsed segments are cached until deleted; a missing segment reads as a reported hole once per file (bounded, since pool workers see new paths every turn) and is not remembered as empty. That hole is right for every reader that only shows or replays the chat: where the disk is the store (desktop, a standing pod) a lost segment is gone for good, and failing the read would fail every turn of that chat forever. A reader that ships the whole document elsewhere (a transcript repair replaces the remote copy) refuses instead (`MissingSegment` `throw`), so the hole is never shipped as the transcript. Edit-and-resend at a turn inside a segment makes that segment's earlier messages the tail again. `src/store/conversation-archive*.ts`.

### Transcript shadow queue
File writes are authoritative; each mutation also enqueues only its delta (one message plus scalars) for the managed DB shadow, frozen per message rather than cloning the conversation. Per conversation, sends are serialized; past a queue bound, pending ops collapse into one repair whose whole-document payload is snapshotted from the file at send time, in the same synchronous block that consumes the marker, so it contains every write it replaced. A conversation whose earlier send failed never sends message-level ops over the gap; it repairs first. A delete supersedes everything queued. Repairs carry archived segments and imported entries too. At shutdown the queue gets a bounded drain because its pending state is in memory only. `src/store/transcript-shadow*.ts`, `src/store/conversations.ts`.

### Message admission receipts
Acceptance is persisted before execution, so a retried send (same nonce) never runs twice. Receipts survive transcript rewind and deletion, because removing a conversation must never make an old request executable. A receipt is published exclusively after the full record is flushed; an abandoned `.tmp` admits nothing. Corruption is treated as uncertainty, never as proof that execution is safe. A receipt whose turn was refused before recording anything is released so a retry is judged afresh. Retention is far longer than any client's retry horizon; an in-flight turn's receipt is never collected. Collection runs at most hourly, off the settling turn. Matching ignores gateway-enriched context and rotating token bytes. `src/store/message-admissions.ts`, `src/store/message-admission-prune.ts`, `src/transport/message-admission.ts`.

### Card ownership
On a shared agent, a live card (question, approval, connect step) belongs to whoever sent the message that started the turn that raised it, decided by turn id (another member's message can land between). Only that person may answer, dismiss, import into or truncate the conversation; requests without a signed identity (desktop, self-host) and host-fired routine messages (`ROUTINE_FIRE_HEADER`, set only by the host's `fireTurn`) are exempt. Delete is not gated, since it is the way out of a card whose person is gone. `src/store/interaction-owner.ts`, `src/transport/interaction-owner-gate.ts`, `src/transport/conversation-routes.ts`.

### Truncation and compaction markers
Edit-and-resend cuts from the first message of the named turn and stamps a one-shot `needsSessionReplay` marker so the next turn replays the kept transcript into a fresh session; the marker is re-armed when a consuming turn ended with no reply. A Claude `/compact` summary is written before the resume mapping is dropped, in the same atomic write as its transcript marker, and removed only once delivered. Only a command's bare marker folds into the summary. `src/store/conversation-truncate.ts`, `src/store/conversation-compaction.ts`, `src/store/conversation-append-assistant.ts`, `src/store/stored-conversation.ts`.

### Routine results location
A routine chat's earlier replies are kept inside the conversation's session dir so they hydrate with it. `src/store/routine-results.ts`.

## HTTP transport (src/transport)

### One door for every message
`POST /conversations/:id/messages` is the single entry for every channel (composer, relayed WhatsApp or Slack, routine fire). Order: draining refusal, replay lookup, card-owner check, conversation commands (`/clear`, `/compact`, ahead of the provider gate so a user can always recover a chat), mode normalization (only known literals; a send with no mode runs on the conversation's kept mode), gateway context (org and caller), provider gate (a pinned turn is never gated on the active provider), command gate held for the turn's life (a command arriving mid-turn is refused instead of tearing the session down). `src/transport/conversation-start-turn.ts`, `src/transport/conversation-command-start.ts`.

### Not here, not now
`503 {"error":"engine unavailable"}` is the gateway's waking shape byte for byte; every shipped client treats it as a state and re-sends the same message (same nonce). A no-provider refusal is a 409 with a machine-readable `code` the host scheduler reads to demote a routine firing. `src/transport/engine-unavailable.ts`, `src/transport/no-provider-refusal.ts`.

### Every request runs inside its acting identity
All routes, not just the message route, run inside the acting identity from the request headers, so credential resolution is scope-correct everywhere. `src/transport/server.ts`.

### Boot order
Turns the previous process died on get their honest reply before anything can read history; automatic resumes of resumable turns start only once the port is open. The anthropic shared-dir probe is warmed at boot and on provider routes so a just-completed login reads connected on the next poll. Busy reflects turn lifecycle, never the event stream; a draining runtime reads busy until it exits. `src/transport/server.ts`, `src/transport/provider-routes.ts`.

### Events stream
Fresh connect gets a `sync` frame then live frames; a resume cursor (`?after=` or `Last-Event-ID`, the header wins because the gateway advances it past its own replay) replays from the buffer or degrades to a resync. Sequenced frames get an SSE `id:` line. Frames are flushed immediately so a terminal `done` never sits in a Nagle buffer. A deleted conversation's channel is dropped so stale cursors resync. A failed stitch closes the stream so the client reconnects. `src/transport/events-route.ts`, `src/transport/sse.ts`.

### Provider and credential routes
API-key connect: offline preconditions (clean 400), live verification aimed explicitly at any pasted Azure endpoint, then store; the typed `reason` goes to the dialog. The host's rollback, when its central store rejects a key the runtime already persisted, removes only that exact key and is idempotent. Logout and rollback are the only writers that clear a credential and log the moment (never the key). The scrub is provider scoped. A desktop-pushed Claude OAuth credential is materialized into both SDK sinks (config dir file and auth store), access-only on managed pods. `src/transport/api-key-*.ts`, `src/transport/provider-routes.ts`, `src/transport/claude-oauth-route.ts`, `src/transport/auth-action-route.ts`.

### Mid-turn mode switch, edit-and-resend
The Mode pill applies to the running turn's live-mode ref; `applied: false` is benign. Edit-and-resend only cuts; the client then posts the edited message normally. A busy conversation answers 409. `src/transport/conversation-routes.ts`.

### CORS
Auth is a bearer token, not a cookie, so a wildcard origin is acceptable by default; `HOUSTON_CORS_ORIGIN` narrows it. `src/transport/cors.ts`.

### Browser hand-off live view
Frames stream down SSE and input batches go up by POST, same handlers in server and turn mode. A request touches the hand-off it names (else the chat's latest), and only for the person it was handed to. An ended hand-off answers its terminal status once. Input bodies (typed text) are never logged. `src/transport/browser-live-*.ts`.

## Harness backends (src/backends: seam and pi)

### The HarnessBackend seam
Turn execution sits behind a provider-agnostic port; pi is the default backend and any provider without a registration resolves to it; a lookup with neither throws so a turn never runs on no backend. `prompt` resolves at turn end and provider failures arrive as `provider_error` wire events, never throws. Sessions also expose raw liveness (every model stream event, including ones the wire drops such as streamed tool input), assistant message starts, reply beats, model phase and per-call timings, because the stall watchdog and finish marks need signals the wire dialect does not carry. `src/backends/types.ts`, `src/backends/registry.ts`, `src/backends/model-phase.ts`, `src/backends/reply-beat.ts`.

### Wire translation shared by both runtimes
The long-lived server and the per-turn worker use the same pi-to-wire mapping and must emit identical frames. A per-subscription translator injects a paragraph break between content blocks (text, tool call, text), which the flat delta stream would otherwise concatenate. Tool output is clipped at the source so every carrier holds a bounded preview. Usage: pi reports `totalTokens` as the sum of all parts for every provider; context fill is input plus cache reads and writes; output alone is no context signal. `src/backends/pi/wire.ts`.

### Provider errors are held until the prompt settles
pi recovers from some failures inside one prompt (overflow compaction then retry, auto-retries). An errored `turn_end` is held; a later clean assistant turn drops it; the newest failure replaces an older one; at settle, a still-held error surfaces. An aborted turn is neutral. `src/backends/pi/wire.ts`, `src/backends/pi/turn-failure.ts`.

### pi failure side effects
A failed turn is logged once with verbatim text, borrows a terse Codex refusal's explanation, marks auth failures and exhausted accounts on the status surface, and reports confirmed revocations by the digest of the token the request ran on. Status is read from pi's structured diagnostics when present. `src/backends/pi/turn-failure.ts`.

### Session files
pi's `continueRecent` filters by the cwd in each session header, but pool turns hydrate into a fresh temp root each time, so the newest session file in the conversation dir is reopened by filename order (hydration rewrites mtimes) wherever it was written. Only a missing dir means no sessions; other IO errors fail the turn rather than answering with silent amnesia. Corrupt or zero-byte files are skipped rather than rewritten as blank sessions; only the header line is read. A cross-backend rebuild mints a new session file. `src/backends/pi/session-files.ts`, `src/backends/pi/backend.ts`.

### Session rotation
Summarized history is reclaimed only when it saves a material store transfer; the archived file is left untouched (including pi's newline repairs). Omitted ancestry is resolved without changing live ids. A hydrated filename can be ahead of the worker's clock, so the successor's name is advanced past it so filename-based resume picks it. `src/backends/pi/session-rotation.ts`.

### Tool results in the outgoing context
pi's `transformContext` shrinks what each request sends of tool results; the session file keeps every result whole. Stale results are saved by content hash and replaced by stubs; a failed save sends the result whole (a bigger request, never a lost one). Every call keeps a paired result because providers refuse an unpaired tool call. `src/backends/pi/tool-result-context.ts`.

### pi backend construction
The same factory serves the long-lived server and per-turn workers. A pooled turn supplies its own base prompt so both backends describe the same capabilities. pi's transport defaults to `auto`, which reuses pi's cached Codex WebSocket across a conversation; when no transport is named, nothing is passed. Every session request is hedged. Modes clamp the tool allowlist (plan read-only, auto drops ask_user). `src/backends/pi/backend.ts`, `src/backends/pi/transport-settings.ts`.

### Thinking level for Terra
Houston's max arrives as xhigh; Terra accepts max but not xhigh (probe recorded in `ai/codex-offered.ts`) despite pi's baked map, so the pi backend restores max for it. `src/backends/pi/thinking-level.ts`.

### Follow-up pass model allowlist
The follow-up suggestions pass holds the turn's `done` for up to its timeout, so it runs only on hosted models known to answer small requests fast. `src/backends/pi/follow-up-models.ts`.

### Model call timing and phases
`turn_start` precedes each request (auth refresh and context transform count as request time); the assistant `message_start` fires when the response opens. Tool runs are not request time. `src/backends/pi/model-calls.ts`, `src/backends/pi/model-phase.ts`.

### Session options
A cross-backend rebuild sets `fresh` so the new backend never resumes its stale pre-switch store; canonical history is built only if a native resume is rejected. Gateway workspace and user context ride the turn body in cloud. `src/backends/create-session-options.ts`.

## Claude Agent SDK backend (src/backends/claude)

### Why a second backend exists
When the active provider is `anthropic`, every model call (turns, titles, one-shot prompts, compaction) runs through the Claude Agent SDK and the bundled Claude Code CLI, so a subscription is used only through the sanctioned client. The SDK is an optional dependency, imported lazily inside `createSession` and shared once per process (retrying after a failed preload). `src/backends/claude/backend.ts`, `src/backends/claude/one-shot.ts`, `src/backends/claude/title.ts`, `src/backends/claude/sdk-loader.ts`.

### Subprocess environment is an allowlist
`options.env` replaces the subprocess environment, and the subprocess runs model-directed Bash, so the env is built from an allowlist (compared case-insensitively because Windows env keys vary in case): POSIX essentials, `USER`/`LOGNAME` (the CLI names its macOS Keychain account after the username; without them it resolved the wrong item), locale, temp dirs, the Windows shell override (`CLAUDE_CODE_GIT_BASH_PATH`, repaired by the desktop shell; the CLI refuses to start on Windows without it), Windows process bootstrap vars, and proxy and CA vars. It carries exactly the connected credential (`CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY`), and the credential keys are asserted absent from the ambient copy. `src/backends/claude/claude-env.ts`, `src/backends/claude/credential-env-vars.ts`, `src/backends/claude/claude-token-env.ts`.

### CLI behavior switches
- `@path` prompt attachments are off: files enter a turn only through tool calls.
- The CLI's git context (a `git status` at startup outside the tool gate plus commit guidance) costs about 1.9k tokens per request and is turned off.
- `CLAUDE_CODE_TRANSCRIPT_LOCAL_GC` (undocumented; `cli-transcript-gc.test.ts` fails if an SDK bump drops it) rewrites the transcript from its last compact boundary after compacting.
- The CLI's own auto-compaction stays on, because the same switch disables its recovery from an overflowing request; Houston compacts earlier on its own.
- `API_TIMEOUT_MS` is the first-byte deadline sized for the turn's largest prompt (resumed history plus prompt plus expected growth), because the CLI uses one deadline for every request of a run and retries timeouts itself.
- An empty `CLAUDE_SECURESTORAGE_CONFIG_DIR` makes the CLI read `~/.claude` (the machine user's personal credential) and a relative one resolves against the workspace, so the value is always absolute or the variable is unset; it is not passthrough.
- Without an SDK `title`, the CLI fires a Haiku title call on the user's plan for every new conversation.
- `settingSources: []` keeps the host machine's own Claude settings out of the subprocess.
- On Linux the CLI exits at startup without bubblewrap when env scrubbing is requested.
`src/backends/claude/claude-env.ts`, `src/backends/claude/query-defaults.ts`, `src/backends/claude/turn-prompt-size.ts`.

### Credential resolution order
The store entry (auth.json) when unexpired, then the shared login file, then the config dir's own credential. An expired served token is not an absent credential: on a pod the gateway is the authority, and the shared file there is a push-time leftover that may belong to another member, so it is not adopted. A pasted api_key carries no issuance date and is never superseded. A shared login that proves itself newer than the runtime's own OAuth copy supersedes it, and the superseded entry is deleted (only on proven supersession) so it cannot win again; a failed delete logs and the turn still runs. An expired served token is never handed to the SDK because the env token outranks the config dir's self-refreshing credential. The token digest is captured at spawn preparation for revoked-token reports. `src/backends/claude/read-token.ts`, `src/backends/claude/shared-login.ts`, `src/backends/claude/shared-login-file.ts`.

### Shared login dir and per-agent session maps
`<HOUSTON_HOME>/claude-login` is one config dir shared by every agent (a single login connects them all; the desktop shell writes there too). On Linux the credential is `.credentials.json`, materialized on hosted pods. The SDK writes transcripts under the shared `projects` tree, scoped by cwd slug (non-alphanumerics replaced by `-`); each agent's `sessions.json` (conversation to session id) lives under its own data dir. The shared login file is parsed once per change, keyed by inode, size and mtime, since every credential read of a turn lands there. `src/backends/claude/paths.ts`, `src/backends/claude/sessions-store.ts`, `src/backends/claude/transcript-files.ts`.

### Shared login is team material on shared pods
The pod-shared config dir holds the team's credential. A personal scope with no personal token must never reach the SDK, so the backend refuses before spawning with a typed reconnect card; a member never adopts the team file (it would run and bill their turn on the team account). Mid-turn 401 recovery reads the CLI's credential store, so a personal turn points `CLAUDE_SECURESTORAGE_CONFIG_DIR` at the member's isolated directory under `auth-users/` (excluded from store-sync and denied to file tools); a personal scope with no data dir fails rather than inheriting the shared store. Materializing the shared file is refused for a member. `src/backends/claude/scope-guard.ts`, `src/backends/claude/credentials-file.ts`.

### Materialized credential file and connected signal
The file's existence used to be the pod's "connected" signal, but a stale file outlives its credential; it now counts only when it parses and carries an unexpired token (expiry 0 means none recorded). On desktop the credential lives in the Keychain, so `claude auth status --json` is probed: only a parsed boolean `loggedIn` is an answer (non-zero exit with valid JSON is a real sign-out answer); a timeout, kill or garbled output is unknown and never overwrites the cache. Results are reused for a TTL (the frontend polls tightly), concurrent callers share one subprocess, a failed probe backs off on its own clock without stamping the TTL, and login or logout forces a reprobe. Logout clears the Keychain entry and rejects on failure. A central not-connected removes the materialized file. `src/backends/claude/credentials-file.ts`, `src/backends/claude/credential-status.ts`, `src/backends/claude/credential-probe-cache.ts`, `src/backends/claude/auth-cli.ts`, `src/backends/claude/credential-removal.ts`.

### Fresh credential on every attempt
Every `query()` spawns its own subprocess, so each attempt re-reads the stored credential and rebuilds the env; the per-turn env overrides the build-time one. The digest of the token in use is updated each attempt so the conversation cache can rebuild sessions left on a rotated-out token and revocation reports name the right token. `src/backends/claude/session-turn-attempt.ts`, `src/backends/claude/refresh-auth.ts`.

### Resume handling
The SDK resolves `resume` only under the current cwd's slug; a transcript left under an old slug (agent renamed) is moved home, and a mapping whose transcript is gone is dropped. If the SDK still rejects the id, the turn reruns once as a fresh session seeded with canonical history. A resumed session that comes up without Houston's MCP tool server also reruns fresh rather than letting the model work without its tools; the dropped mapping is not re-stored from the abandoned attempt. A cross-backend rebuild never resumes the stale pre-switch session. Next-step suggestions: a resumed native history can make the model call its former `suggest_actions` tool even when it was not offered this turn; the call succeeds silently and still ends the turn. `src/backends/claude/sessions-store.ts`, `src/backends/claude/session-prompt.ts`, `src/backends/claude/tool-server-lost.ts`, `src/backends/claude/next-step-suggestions.ts`.

### Error handling per turn
Typed SDK error enums map deterministically to `ProviderError` (the SDK already classified) without going through `classifyProviderError`, so the credential scope stamp, auth and quota marks and revocation reports are applied explicitly. Anthropic's org policy block is a user-org state, not a credential failure. At most one provider_error per turn: the SDK often rejects the iterator right after an error result, and that trailing throw is not reported again. A Stop makes the iterator throw; it is swallowed because the stop already surfaced. Any other throw becomes a typed provider_error so a turn never dies silently. `src/backends/claude/errors.ts`, `src/backends/claude/session-turn-attempt.ts`, `src/backends/claude/translate.ts`.

### Usage limit versus rate limit
Claude Code reports both as `rate_limit`. A usage limit is recognized when the turn's `rate_limit_event` says the window was rejected (and not carried past by overage), when the text is Claude Code's own limit sentence, or when the wait exceeds an hour (API 429s ask for seconds to minutes). Only a rejected event's `resetsAt` is when requests resume; values below 1e12 are seconds. A rejected window reopening within the hour is waited out like a 429. The limit sentence's reset time is parsed with its zone: a time with no date is the five-hour window and lies at most five hours ahead; a date with no year more than half a year behind belongs to next year; an unknown zone is an unknown reset. Messages stamped `<synthetic>` name no model. A plan usage window does not mark the credential out of credit. `src/backends/claude/usage-limit.ts`, `src/backends/claude/usage-limit-reset.ts`.

### Translation to the pi wire dialect
SDK messages map to the same frames as pi. Tool input accumulates across `stream_event` deltas and is parsed at block stop, but the tool_start uses the SDK's own parse from the `assistant` message (the arguments the CLI actually ran with), which arrives before the stop. The SDK's invalid-JSON marker means the CLI skipped the call and asked the model to retry. Blocks left open when the next response starts are a broken stream the CLI retries itself (breadcrumb only). Paragraph separators are injected between content blocks on the follow-up block's first delta. Context fill is the newest per-request usage, never the result's turn-cumulative aggregate; a failed request's all-zero usage is never a fill; a compact boundary re-anchors the fill; usage normalization byte-matches pi's. A structured tool result is message-wide and not attached when a message has several result blocks. `src/backends/claude/translate*.ts`, `src/backends/claude/sdk-message-shapes.ts`.

### Houston tools over in-process MCP
Houston's pi tools are bridged verbatim onto an in-process MCP server named `houston` (the model sees `mcp__houston__<tool>`; the mapping is stated once in the system prompt). Typebox schemas are converted to zod raw shapes because the SDK requires them; closed string sets are read first since typebox unions of literals have no top-level `type`. Bridged tools are auto-allowed since no human sits at the runtime to approve, which makes the SDK warn on every `query()`; that warning is reported once at info while every other process warning still prints. Gates and modes match the pi path exactly (coordinator clamp, plan keeps ask_user and plan_ready only, auto drops blocking tools). Abort signals are forwarded so a Stop cancels proxy fetches, and tool calls are logged with the same record as pi. Oversized capped results go out as their head with the spill path; a failed save sends the result whole. `src/backends/claude/custom-tools.ts`, `src/backends/claude/mcp-tool-*.ts`, `src/backends/claude/schema-to-zod.ts`, `src/backends/claude/sdk-warnings.ts`.

### Built-in tool policy
The SDK built-ins are clamped to what pi exposes (Read, Edit, Write, Glob, Grep, plus Bash only when code execution is local); Claude Code tools without a pi equivalent are listed in `disallowedTools`. Plan mode keeps Read, Glob and Grep and denies writes; it does not use the SDK's `permissionMode: "plan"`, which forces the ExitPlanMode tool. The coordinator keeps only Read and Write for memory consolidation. Credential deny rules ride `disallowedTools` too. `src/backends/claude/tool-policy.ts`, `src/backends/claude/credential-rules.ts`.

### Workspace guard as a PreToolUse hook
Claude Code auto-approves reads inside `cwd` without asking `canUseTool`, so the workspace guard runs as a PreToolUse hook on every call, in one callback after the pooled turn's tool gate (the SDK lets a tool run once a hook times out, so the gate answers first). An allowed call has its path fields replaced by the absolute path the guard proved, so the tool opens exactly what was judged. Any built-in that names a path and is not known to be read-only is judged as a write. A search with no folder searches the workspace root, which must be in bounds. Glob's pattern is a path and is clamped; Grep's is a regex. Bash commands are split into shell words (quotes and backslash escapes respected, since most agent paths contain spaces) and absolute, `~` or climbing `..` tokens are clamped on both separators. The permission gate is a second wall for non-auto-approved calls and honors the SDK's `blockedPath`. A live switch to plan mode mid-turn denies Edit, Write and Bash on a session built at execute. One-shot calls run with a hook that refuses every tool. `src/backends/claude/file-guard-hook.ts`, `src/backends/claude/file-call-judgment.ts`, `src/backends/claude/tool-gate-hook.ts`, `src/backends/claude/tool-permission-gate.ts`, `src/backends/claude/bash-words.ts`, `src/backends/claude/tool-target-paths.ts`.

### Turn end hook
pi lets a tool result end the agent loop (`terminate`); the SDK's MCP transport has no such hint, so a PostToolBatch hook stops the subprocess after a batch in which a tool marked the turn ended. `src/backends/claude/turn-end-hook.ts`.

### Compaction on the SDK
Summarize then restart: a summarization turn inside the conversation's own session with the same tools, system prompt, model and effort (the cached prefix), every tool call denied, then the mapping and transcript are purged (dropping only the mapping left one unreachable JSONL per compaction in the shared dir). The restart is the last step so any earlier throw leaves history whole. The summary seeds the next prompt exactly once, marked as a record. pi's refusal sentence for a too-short session is reused verbatim so both backends fail alike. After compaction the fill is unknown until the next usage frame, so autocompact does not fire on every turn. Stale tool results are cleared before the autocompact check. `src/backends/claude/compact.ts`, `src/backends/claude/session.ts`.

### Stale tool-result clearing in the CLI transcript
Each turn resumes the CLI from its transcript JSONL and the request is rebuilt from that file, so replacing a stale result there removes it from what the model is sent. A round is a message id (one entry per content block). Freed tokens are counted at four characters per token, an undercount that errs toward compacting. A capped result already names its full file and is not saved again. `src/backends/claude/transcript-clearing.ts`.

### Feature-flag cache seeding
With an empty GrowthBook cache in `.claude.json` the CLI blocks startup on a network fetch; a stored cache is seeded into config dirs that have no `.claude.json` yet (an existing one is the CLI's own state). An empty feature map is no cache; corruption costs only the one boot. `src/backends/claude/flag-cache.ts`.

### Bun-compiled desktop sidecar binary
Only inside the Bun-compiled sidecar (modules served from `/$bunfs/` or a `~BUN` root) is the `claude` path passed explicitly; the Node path lets the SDK resolve its platform package. A present placeholder staged by `build.rs` (detected by leading bytes, not a native image) is worse than a missing binary because the historic stub sleeps forever, so it throws a typed error. `src/backends/claude/binary-path.ts`.

### System prompt assembly parity
Order: Houston prompt, workspace-root context file (frontmatter answers rendered as text), workspace and user context, the coordinator's memory and rules (role gated), the skills index (same `<available_skills>` section pi builds, via pi's own loader, sorted for stable order across filesystems), and the mode overlay last. The title instruction also rides the prompt because the CLI has been seen running its full preset despite a custom system prompt. `src/backends/claude/system-prompt.ts`, `src/backends/claude/title.ts`.

### Effort mapping
pi levels map to the SDK's `{ thinking, effort }`: minimal and low enable thinking at the lowest effort; every anthropic lineup model supports low. Model ids map from pi's dash form to the SDK string. `src/backends/claude/effort.ts`, `src/backends/claude/model.ts`.

## Pooled per-turn runtime (src/turn)

### Pooled turn lifecycle
A pool worker admits bounded work (capacity defaults to one slot), hydrates a throwaway agent root, runs once, makes its writes durable, and wipes the root. Everything is per request, unlike the long-lived server's module state, but the turn must behave exactly like the standing runtime: same wire frames, same autocompact rule, stall watchdog, routine semantics, mission titling, token ledger and doc projections. A claimed turn's lifetime is the claim, not the HTTP connection: the gateway can lose its stream and re-attach through the turnlog. `src/turn/server.ts`, `src/turn/server-work.ts`, `src/turn/execute-turn.ts`, `src/turn/execute-ready-turn.ts`.

### Admission, body size, and single-use spending
Admission happens before draining the request body (uploads are about 135 MiB; parked requests must not buffer several bodies on a one-slot worker), and draining is re-checked after acquiring the slot. Upload ops accept the pod's Files import cap plus envelope headroom; the dispatcher may inline up to 16 MiB of agent files and gzips far dispatches, and the cap bounds the inflated JSON too. A real claimed turn spends a single-use worker and the spent latch is written before execution so a crash mid-turn cannot leave a restartable container willing to serve; a shadow warm-up does not spend it. An unclaimed real turn would run local bash without spending the worker, so it is refused. A spent worker reports not-ready so probes mark it 0/1. `src/turn/server-work.ts`, `src/turn/single-use.ts`, `src/turn/server.ts`.

### Incarnation fence
The `X-Internal-Token` is stable per ordinal, so a replacement pod reusing an ordinal and IP would accept turns minted for the previous pod; dispatched turns and ops carry `X-Pool-Pod-UID`, which must match the pod's own downward-API UID. Registration heartbeats are authenticated by this worker's own token, read from a single projected file (never a directory of every ordinal's token); no pod identity is self-reported. A worker does not serve until the gateway acknowledges it; SIGTERM and single-use spending both drain. `src/turn/server-http.ts`, `src/turn/worker-registration*.ts`.

### Turn deadline
The gateway's turn token (and the E2B sandbox) lasts 30 minutes from dispatch. The worker reads the expiry without verifying (the key is the gateway's), using `iat` so the lifetime is clock-free against a snapshot-restored sandbox clock. A reserve is kept free at the end for the final durability sync; a browser hand-off gets the remaining budget or is refused when too little remains for a person to sign in. `src/turn/turn-deadline.ts`.

### Hydration scope and hot set
A claimed turn lists a critical set level by level (a handful of one-level listings instead of listing the whole store) and hydrates runtime inputs before the bulk tree, capped at 2 GiB. The agent's own files (anything under a folder of the agent directory other than startup folders: Houston state, skills, harness settings) hydrate behind the prompt under a separate budget: the model starts while they download and every tool waits on them (a failed download or the tool-gate deadline refuses the tool); the file-change snapshot is taken once they land. If no tool ran, nothing in the deferred folders is the turn's, so their absence deletes nothing. Hot-set admission per conversation: its canonical file, no archive segment (a reader that reaches one fetches it on demand, with concurrent readers sharing fetches; see ADR 0116), harness markers, the newest pi tail, and never another member's Claude flag cache. pi's SessionManager only discovers direct `*.jsonl` files. Approval records are excluded from bulk hydrate and use their own guarded path. Store-root folders such as the package store are never listed. `src/turn/turn-filesystem*.ts`, `src/turn/turn-store-scope.ts`, `src/turn/turn-store-walk.ts`, `src/turn/turn-hot-set*.ts`, `src/turn/turn-deferred-*.ts`, `src/turn/turn-archive-fetch.ts`, `src/turn/turn-claimed-hydration.ts`.

### Turn root permissions
Each conversation's turn root is created exclusively and never reused or removed (a concurrent turn may be running in it). Modes are explicit, not the umask's: under a tool shell the umask is 002 and the root is group-shared, so it is chmod'ed to sticky 0770 while keeping the inherited setgid bit (chmod clears it unless included). The root's path reaches the model through cwd and the prompt. GCS downloads follow the umask and planted symlinks, so sign-in state is written through the runtime's own path. `src/turn/turn-root.ts`, `src/turn/gcs-store.ts`.

### Layout refusals
Setup failures before provider work use stable codes shared with `@houston/wire-types` (the two lists must match or compilation fails) and are answered as a terminal error frame on both the response and the turnlog. A claimed turn over an empty tree means the hydrate missed (`layout_unexpected`); only an unclaimed legacy runtime may start from empty. An agent still on the pre-v0.4 flat layout may only run the `migrate` op. A folder with only `.houston/<family>/*.schema.json` or a runtime tree is not an agent. `src/turn/turn-layout*.ts`, `src/turn/turn-terminal.ts`, `src/turn/turn-setup-failure.ts`.

### Sync-back ownership and durability
A claimed writer may sync only its granted turn-owned files, mirroring the store's turn-claim object scope exactly (a path admitted here but rejected by the store would fail late). The board is shared by concurrent turns and the gateway's card writes, so it merges three-way over bounded rounds. Guarded document writes re-read, re-apply and generation-guard up to three times. A fenced worker no longer owns the conversation and nothing it did is done; a heartbeat checkpoint after sync and publish catches a claim adopted mid-flight. Failed provider work may still have durable tool writes, so sync still runs. If a replacement write fails, the durable source object is kept rather than completing its delete. The terminal frame lists the domain events the landed writes imply; a family whose doc projection failed is left out so no asleep refetch is promised that would fall to the pod. The heartbeat loop runs every 15 seconds and a mode the gateway reports becomes the live mode. `src/turn/turn-filesystem-sync.ts`, `src/turn/turn-agent-scope.ts`, `src/turn/turn-durability*.ts`, `src/turn/turn-doc-*.ts`, `src/turn/turn-changed-events.ts`, `src/turn/claim-heartbeat.ts`.

### Doc projections for asleep reads
The gateway serves a sleeping agent's tabs from five family docs and view docs. Every projection is derived from what the store holds once the doc revision is read (never a blind copy of the writer's hydrated snapshot), normalized like the standing projector, with the same tolerant parse (BOM strip, salvage). Skills views merge per slug for only the slugs whose top-level SKILL.md changed. A doc the store refuses (403/404 from an older deployment) is as stale as a failed one. Projections get one more round on failure; files are durable regardless and a lag is logged, never re-run (re-running a partly durable write would duplicate it). `src/turn/op-republish.ts`, `src/turn/turn-family-docs.ts`, `src/turn/turn-*-doc.ts`, `src/turn/turn-skills-view.ts`, `src/turn/op-durability.ts`.

### Transcript rows and turnlog
The user row is published as soon as the runtime persists it, so a gateway restart can reconstruct the turn. The one assistant row per turn is the last record under its turn id. Older deployments may lack transcript routes: the first PUT is the probe, later 404s are real misses. Transient 502/503/504 and network drops retry (routes are idempotent per turn id); error strings carry the status only, never the body. Turnlog frames post the first frame immediately (initial batching delay is user-visible) and coalesce behind an active POST; a dropped batch is a permanent seq gap that makes the gateway resync. Each execution starts at the gateway-provided first sequence number because the turnlog is one stream per conversation. Timeouts use live event-loop time so a synchronous stall does not abort a request before its socket is read. `src/turn/turn-transcript*.ts`, `src/turn/turn-log*.ts`, `src/turn/turn-sse-emitter.ts`.

### Ops for sleeping agents
`POST /op` runs a write for an agent whose pod is asleep: claim, hydrate, the pod's real handler, scoped sync-back, doc republish. The worker accepts only the op-route shapes the gateway classifier dispatches (allowlist mirrors the Go classifier); reads run as ops only where no doc can serve them; binary bodies ride `bodyBase64` only for migration imports. Ops decline (so the gateway falls back to the pod) for a different agent, legacy layout, a lazy read refused mid-handler, providers that need the pod (anthropic titles must use the Claude SDK, which is pod-only), or OAuth definitions without gateway callback custody. If nothing landed, declining is safe; if something landed and something conflicted, the write is partly durable and is never re-run. Route ops never see the agent's runtime tree; agent-level ops run over a lazy tree whose overlay materializes objects on first read. Custom integration executors hold live MCP connections and are closed per op; the engine is imported lazily. `src/turn/execute-op.ts`, `src/turn/op-*.ts`.

### Settings, credential and endpoint ops
Mirror the pod's handlers step for step: validate, verify the key live (a rejected connect persists nothing), write the endpoint after verification and before the key (a stored key never aims at nothing), push the verified key to the gateway credential store, and sync back only the exact runtime-dir files the handler writes. A connect never moves an agent that already resolves to a provider. `src/turn/op-settings.ts`, `src/turn/op-credential.ts`, `src/turn/op-endpoint.ts`, `src/turn/op-tree-options.ts`.

### Seed and migrate ops
Seed decides from the listing alone: adopt the one agent tree, seed an empty prefix exactly as the pod's `POST /agents` does, refuse anything else. Uploads are create-only (`ifGenerationMatch: "0"`); a lost race removes this op's uploads except objects someone rewrote since. A seed that crashed half-way is completed with files the tree lacks; docs are re-projected for young agents. Family files whose flat pre-v0.4 twin still exists are never created, because the migration copies only into a missing family file. The migrate op runs the host's boot migrations over a store prefix, refuses stores that can never migrate (two agent trees, over the hydration cap) with stable codes the gateway uses to block or back off, writes rewrites with the generation it read, and moves plaintext custom-integration secrets to custody (the plaintext file is removed only when every secret moved). `src/turn/op-seed*.ts`, `src/turn/op-migrate*.ts`, `src/turn/op-grammar-*.ts`.

### Reconcile op
Settles what a pooled turn left when its sandbox died: an interruption reply for the dead turn's chat (idempotent per turn), a lost routine fire recorded as running then settled, board cards for surfaced runs, and the auto-pause for runs that settled on a typed wall, read from durable history after sync-back. A usage-limit snooze is not applied here because a reconciled lost turn names no acting user. Only a settlement that landed whole is done. `src/turn/op-reconcile*.ts`.

### Routine fires on a pool worker
Prompt and pins come from the hydrated routine file; the run gate reads the store's history merged by run id (overlapping fires settle in other sandboxes). A claim for the wrong conversation (stale routines doc) is refused. An abandoned running row stops blocking after the timeout but is settled by reconcile. Terminal bookkeeping is written into the tree before sync-back; a cancel that raced the turn keeps what the canceller wrote; the run id is the turn id. Only the creator's own run snoozes or lifts the schedule. A run-now for a routine the store lacks re-projects the routines doc so the ghost entry leaves every member's list, within a 5 s budget matching the gateway's run-now window. A fire deletes the conversation's hydrated session dir and starts fresh from a digest. `src/turn/turn-routine*.ts`, `src/turn/op-routine-heal.ts`.

### Model and credential for a pooled turn
Precedence: per-turn override, then the agent's settings, then the provider default. A dispatched provider pin outranks the attached credential, so a mismatched credential fails on the provider the user chose. Region- and endpoint-scoped providers (Qwen, Xiaomi, Azure) must read this turn's hydrated files, never the worker's own data dir. A turn with no credential echoes the user message and fails with the reconnect instruction. A served plan the CLI does not know is dropped, never rejected; a Copilot Enterprise domain is kept or the credential would silently become a github.com one. `src/turn/turn-model.ts`, `src/turn/turn-request.ts`, `src/turn/parse-turn-credential.ts`, `src/turn/turn-runtime.ts`.

### Tools on a pooled turn
The allowlist, the tool objects and the prompt get one answer from the grant: a worker configured for remote code still cannot run code without the `code-run` scope, and the model must not be told it can. `run_code` relays through the turn's sandbox facade, which forwards the raw body (base64 inputs up to the gateway's 32 MiB cap) and holds no sandbox URL or identity. The `run_code` budget is per worker because tools are built per turn. The coordinator clamp follows the role alone. The browser tool is built per turn and its contexts are closed (saving sign-ins) before the root is removed. Every fetch on a tool call's behalf is bound to its cancel signal. `src/turn/turn-toolset.ts`, `src/turn/turn-sandbox*.ts`, `src/turn/turn-run-code-limiter.ts`, `src/turn/turn-cleanup.ts`.

### The AI Manager on a pooled turn
The gateway marks Houston's own turn with `coordinator` and binds its credential to the owner and the claim. The turn gets the host's assistant and mission routes over its sandbox facade; approval records persist in the conversation's runtime session dir between single-use sandboxes, saved one at a time with generation guards; an unreadable record fails closed (it may answer no card and mint no grant). Message admissions are kept a week like the host's receipts. A card nobody can answer is not shown. `src/turn/turn-coordinator*.ts`, `src/turn/turn-approvals.ts`, `src/turn/turn-admitted-messages.ts`, `src/turn/parse-turn-coordinator.ts`.

### Mission titles
A new mission's title call starts when the model's response opens and overlaps the reply; the card write lands in the tree before sync-back. A card created after hydration is found by re-reading the stored board and rebasing three-way under the generation read. The terminal frame reports the outcome; title text is the user's words and never rides telemetry. `src/turn/turn-mission-title*.ts`, `src/turn/turn-session-title.ts`.

### Claude CLI on pool workers
The member's flag cache (one file per agent and member, named by a hash) is seeded into the conversation's config dir and stored back when it changed, with its own deadline. A sample of turns runs the CLI's startup profiler so spawn-to-init splits into phases in prod, bounded so the profiler's cost stays out of the p50. The binary is resolved from the SDK's own platform package and paged in at boot with no credential. Compaction checkpoints point at the hydrated tree's conversations dir. Anthropic one-shots never run on pi even if routing regresses. `src/turn/turn-claude-*.ts`, `src/turn/claude-worker.ts`, `src/turn/claude-flags-path.ts`, `src/turn/turn-compactions.ts`, `src/turn/op-provider-guard.ts`.

### Prewarm and network marks
`POST /prewarm` takes no admission slot and opens the provider connection before the turn arrives (skipping DNS, TCP and TLS), bounded so an unused sandbox does not hold it. Endpoints that depend on agent files or token-derived hosts cannot be warmed. A staging experiment stamps provider network milestones onto turn timings; Houston's own origins and prewarm requests are not marked. `src/turn/turn-provider-warm.ts`, `src/turn/server-prewarm.ts`, `src/turn/turn-network-marks.ts`.

### Token ledger on a pool worker
The turn's spend folds into the agent's stored ledger with a generation-guarded read, fold and write, retried while concurrent turns win; the terminal frame waits on it under a deadline so a stalled store costs the ledger entry, never the turn. `src/turn/turn-ledger.ts`.

### Misc wire rules
Mode literals from the wire are validated (garbage becomes execute; absent means the conversation's kept mode). Mention sidecars drop junk entries. A garbled plan-limits stamp means no limit, never a failed turn. Trigger event payloads have hard caps at the worker boundary even though the control plane truncates. The gateway logs at most 32 timing keys, so some diagnostics have their own field. A caught failure's response text is the Error message only. `src/turn/parse-*.ts`, `src/turn/turn-terminal.ts`, `src/turn/server-http.ts`.

## Long-lived session layer (src/session)

### Turn start and serialization
The message route awaits a central credential sync before accepting a turn; the sync is best effort. Turns on one conversation are serialized (ordered resume), and every conversation in a runtime shares one workdir lock. The user message is persisted and announced before taking the lock, so a new conversation's message is visible at once. The turn's wire id is minted up front so even a refused turn terminates under one id. `runTurn` never rejects; failures surface as `error` events, and it counts in flight from the call so `GET /busy` and shutdown drains see it. A new mission's title runs after the reply is published, outside the lock and queue. `src/session/turn-start.ts`, `src/session/exec-turn.ts`.

### Turn execution order inside execTurn
Stop is checked once the lock is held and again before `prompt()`. The model is resolved fresh each turn (a pin wins over settings) and from then on every failure belongs to that provider; a failure before resolution names the pin, else a non-empty fallback word (the unknown card interpolates it). Mode comes from the pin only, never settings. Then: routine fires start fresh with a digest; crossing a backend boundary rebuilds the session (compliance gate) and replays canonical history; a plan/execute flip rebuilds on the same backend; a truncation replays kept turns; a same-backend provider switch replays verbatim when it fits the new window, else compacts; autocompact runs when near full, dividing by Houston's effective window (the same denominator as the context bar). Effort: the pin, else saved, else medium for reasoning models. In multiplayer conversations with two or more distinct authors the prompt is prefixed `[From: <name>]`. The acting identity and used-token capture span the prompt. `src/session/exec-turn.ts`, `src/session/conversation-switch.ts`.

### Turn outcome persistence
Our own aborts (watchdog or Stop) echoed back by pi are dropped, never published. A stall abort resolves like a Stop, so the typed stall failure is synthesized. A context-overflow rejection naming the real window lowers a custom endpoint's assumed window. The file diff is skipped on failed turns. The pending interaction is persisted under the same condition that puts it on the `done` frame. A failed turn sends no clean `done` (the provider_error frame is terminal). A completed turn heals stale auth marks. A thrown failure is persisted, logged (otherwise it never reached Sentry), fed to the status surface, and, for an auth throw with nothing streamed (pi's prompt-time guard, raised before pi records the message), re-arms replay. A turn that died on a revoked token evicts its Claude session. The in-flight marker, live-mode ref and stop marker are cleared in `finally`. Agent-started missions report terminal state even with no client observing. `src/session/exec-turn.ts`, `src/session/turn-start-failure.ts`.

### Stall watchdog
pi resolves a turn on success or a provider_error frame, but a stalled stream resolves neither, and pi's SSE reader has no idle timeout (only its WebSocket transport does). The watchdog resets on every wire event and on raw liveness (streamed tool input produces no wire frame), suspends while a tool runs, applies a tighter first-response window while a request is out, and restarts its loop check on each new assistant message. It logs the cut because pi's echo is logged as an ordinary provider_error. A user's Stop wins over the watchdog. `src/session/stall-watchdog.ts`, `src/session/exec-turn.ts`.

### Runaway output detection
A degenerate generation repeats a short unit; a trailing window with few distinct 4-character sequences is a loop, judged periodically. Text inside markdown code blocks is never judged (repetition there can be intended); fence parsing handles longer openers, tildes, info strings, and lines held back until they prove to be text. `src/session/runaway-output.ts`, `src/session/markdown-fence.ts`.

### In-flight markers, boot settle and automatic resume
A marker file per conversation is written when a turn is accepted and removed on every in-process end, so a marker found at boot is unambiguous: the previous process died on it. It records the running tool (a restart during a shell command is the OOM shape) and whether the child memory fence was on. At boot the settle writes the interrupted reply first and removes the marker last (a crash in between re-settles rather than losing it); a marker for a turn that already has an interrupted reply is a re-delivery. Each restart reports under one Sentry issue name. Resumable turns carry a resume payload (always an object, even empty; never the short-lived `actingAs` token; the scope key is resolved, not copied) and run again after a short delay so credential priming lands first; a resume that dies is not resumed again. `src/session/turn-inflight-marker.ts`, `src/session/settle-interrupted-turns.ts`, `src/session/resume-interrupted-turns.ts`, `src/session/turn-resume-info.ts`.

### Compaction overflow guard
pi's compaction serializes all pre-cut history into one summarization request, which can exceed provider caps (a 31 MB conversation hit OpenAI's 10,485,760-character content cap). A `session_before_compact` extension, injected into every loader, bounds the summarizer input to a fraction of the window and an absolute ceiling (chars/4 estimate), keeping the newest messages that fit and eliding the middle of an oversized newest message. History and turn prefix get separate budgets since pi runs them separately. Size rejections halve the budget a bounded number of times; transient failures decline so pi's path surfaces the real failure; if nothing can fit, it compacts deterministically so the conversation survives. Since pi 0.84 auth headers carry `null` deletion markers that must be stripped. `src/session/compaction-guard.ts`, `src/session/summarizer-budget.ts`.

### Autocompact failure guard
Compaction is a model call every backend can refuse. A failed autocompact holds off further attempts for a cooldown (in memory for the standing runtime; in the synced session dir for pooled turns) so a doomed summarization is not re-paid every turn and the conversation is never wedged. pi's "too little to summarize" refusal is the ordinary state of a fresh chat and is not an error. Errors are reported once per cooldown. `src/session/autocompact-guard.ts`.

### Durable facts at compact time
The personal assistant lives in one never-ending conversation, so compaction is where its history leaves context. Its compaction asks the summarizer to end with a fenced `durable-facts` block; the last block is parsed, filler lines and list markers dropped, bounded in count, deduplicated case- and punctuation-insensitively against existing memories (summarizers restate standing preferences each time), and saved sequentially through the host's merge-safe route (doc-locked). Facts are harvested before `/clear` resets context. `src/session/durable-facts*.ts`, `src/session/conversation-command-run.ts`.

### Conversation commands
`/clear` and `/compact` are matched exactly and run as their own turn in the queue, pinned against eviction and counted busy. They are marked before the first await so no turn is accepted into a context being rewritten, recorded before the lock, and their marker is persisted before it is streamed. `/clear` harvests facts, drops the backend-native session and its on-disk history, and writes a boundary marker; nothing is deleted from the transcript, and no replay carries old turns back. `src/session/conversation-command*.ts`.

### Cross-backend replay
A switch across the backend seam rebuilds the session on a backend that cannot read the old store, so the canonical transcript is rendered as a preamble within a fraction of the new window (same fraction as the same-backend switch and the frontend consent dialog, at about 4 characters per token), keeping the newest messages and hard-clipping a single oversized one rather than dropping it. Only messages after the newest `/clear` are visible to the model. A session reset (edit-and-resend) uses the same carry without the "different AI model" framing. Leaving the Claude backend retires its armed compaction summary. The leaving provider's fill is captured before teardown. `src/session/replay-transcript.ts`, `src/session/conversation-switch.ts`, `src/session/provider-switch.ts`.

### Routine chats
A routine fire starts a fresh session that opens on a short digest of its latest turns (bounded by a token budget), and the full recent replies are written to a results file the digest points at. Fires are recognized by `routineRunPreamble`'s fixed head. No divider is drawn because every fire starts fresh. Every other chat keeps its ordinary replay. `src/session/routine-*.ts`, `src/store/routine-results.ts`.

### Tool surface of the long-lived runtime
Decided once at module load from the role, host reachability and deployment, and handed identically to the pi and Claude backends. File tools are workspace-clamped and shadow pi's builtins by name (pi resolves absolute paths as-is). bash scrubs the child environment to a non-secret allowlist. pi exposes the intersection of the custom tool objects and the name allowlist. Reach per mode: ask_user everywhere; plan_ready plan only; suggest_reusable, follow-up actions, save_routine, save_learning, mission tools, assistant family, request_hands_on and browser in execute and auto, never plan; the coordinator never runs code. A turn-mode worker honors `local` exec only on a single-use pod. `src/session/session-tools.ts`, `src/session/tool-selection-build.ts`.

### Interaction holder
A fresh per-turn holder (AsyncLocalStorage) records what the model is waiting on: question steps (replace semantics), one signin step, connect steps deduped by toolkit, provider cards, credential steps, hands-on errands deduped by screen, an exclusive plan-ready step, and optional save offers and next-step bubbles. Order: approvals, questions, signin, connects and credentials, hands-on last. Outside a turn every record call is a no-op. `src/session/interaction-*.ts`.

### Acting context
The gateway-signed `actingAs` token is the only thing that can select a member's credential scope; a token whose payload cannot be read is not the team (that would let a garbled token read the team credential). `actingUser` alone cannot select credentials. Every request is wrapped at the transport edge. Author attribution decodes the token payload without verifying (the gateway verified it). `src/session/acting-context.ts`, `src/session/attribution.ts`.

### Conversation cache
Live sessions are module state, LRU-bounded and idle-expiring on a clock (not only on next access). Busy sessions are skipped. A cached Claude session pinned to a rotated-out token is rebuilt. The first turn's mode decides how the session is built. `src/session/conversation-cache.ts`.

### Event bus isolation
The bus is the one place conversation isolation is enforced; subscribers are partitioned by scope and conversation id. Fan-out iterates a copy. Seq counters survive a turn's end (the watermark never resets); a deleted conversation drops its whole channel. Pooled turns release state after cleanup. `src/session/bus.ts`.

### Child memory fence
Processes the model spawns get a per-process cap: the container's cgroup limit (v2 first, then v1, where values near 2^63 mean unlimited) minus the engine reserve, never below a floor that would starve git or npm. Applied with `ulimit -d` (1024-byte blocks). The Claude CLI's Bash tool runs through a wrapper named in `CLAUDE_CODE_SHELL_PREFIX`, which Claude Code splits at its last " -"; the wrapper is rewritten on every call so a cap change never leaves a stale script. `src/session/child-memory-fence.ts`, `src/session/claude-shell-fence.ts`.

### Titles and generation
Titles route like turns: the conversation's own provider, through the Claude SDK when it is anthropic; a disconnected provider yields no title rather than rerouting. Mission titles run on the turn's own model in the same runtime, capped at 6 words and 64 characters, under a timeout that counts from the reply's end; host unreachability keeps the fallback title quietly. `src/session/summarize.ts`, `src/session/mission-title*.ts`.

### Prompt resources
The base prompt's capability sentence must match the tool allowlist. Only the workspace-root context file is loaded (pi's own walk would pick up files outside the workspace); frontmatter answers are rendered as plain lines. `noSkills` disables pi's default skill dirs while `additionalSkillPaths` still load; inline extension factories load even with `noExtensions`. Order: workspace and user context, memory, rules, mode overlay. Workspace context comes from local files or, in cloud, gateway blobs; an unreadable file is treated as empty. Skills in the index are sorted by name then path, and descriptions that open with trigger phrasings are cut to what the skill does. `src/session/resource-loader.ts`, `src/session/workspace-context.ts`, `src/session/prompt-skills.ts`.

### Follow-up pass
A clean reply with no `suggest_actions` call gets one small tool-free request without history, tools or product prompt. Replies are often fenced JSON; an unusable reply costs only the bubbles and is warned once per process. `src/session/follow-up-pass.ts`.

### Tool result spill and logging
Oversized tool results are saved inside the agent folder by content hash (saving again is free) so the model can read them with its file tool; pruning drops the oldest mtime first. Every tool call logs one line in `runtime.log` with tool, duration and outcome, and a throw is logged then rethrown untouched. File-change tracking diffs user-visible files only (no dot-files, no build output, not the seeded role files) and never reports deletions. `src/session/tool-results/spill.ts`, `src/session/tool-call-log.ts`, `src/session/file-changes.ts`.
