# Provider Errors — typed taxonomy + card surface

**Every model-request failure collapses into one of EIGHT typed `ProviderError`
wire kinds, and each kind renders as its own inline chat card with a concrete
CTA.** Providers run in-process in pi — there is no CLI stderr to parse; the
runtime classifies pi's errored `AssistantMessage` (provider + model +
errorMessage) into the wire shape.

- Wire type — `packages/protocol/src/provider-error.ts`
- Classifier — `packages/runtime/src/ai/provider-error.ts` (pure,
  `provider-error.test.ts` covers every branch with verbatim provider strings)
- Card dispatcher — `app/src/components/shell/provider-error-card.tsx`
- Frontend union — `ui/chat/src/types.ts` (a superset; see *Dormant kinds*)

## The eight live kinds

| Kind | Extra payload | Fires when | Card + CTAs |
|------|---------------|-----------|-------------|
| `unauthenticated` | `cause` (`no_credentials` \| `token_expired` \| `token_revoked` \| `invalid_api_key` \| `org_policy_blocked` \| `unknown`), `undelivered_prompt?` | Credential missing, expired, revoked server-side, or rejected. | `UnauthenticatedCard` (`provider-error-cards/auth.tsx`). Reconnect through whatever surface `reconnect-surface.ts` picks (OAuth browser login / api-key paste dialog / local-endpoint dialog), then waits on `ProviderLoginComplete`, flips to a green "Reconnected" state and runs a one-shot auto-resume. **Names no provider → the generic variant**: plug icon, no brand, CTA opens the AI Hub (see *Attribution*). **`org_policy_blocked`** (Anthropic's SDK enum `oauth_org_not_allowed`, mapped in `backends/claude/errors.ts` — the org/policy blocked subscription access for this environment; PRODUCT-1393): reconnecting cannot heal it, so the card never offers Reconnect — its `open_ai_hub` action opens the AI Hub to connect an API key instead. It never fires the revoked-token report. |
| `rate_limited` | `model`, `retry_after_seconds` | Short-window throttle. Waiting helps. | `RateLimitedCard` (`limits.tsx`). Retry + Switch model; body interpolates the countdown when present. |
| `quota_exhausted` | `model`, `scope` (`free_tier` \| `paid_plan` \| `organization` \| `unknown`), `resets_at` | Account out of credit or blocked on billing — the "pay or switch" state. HTTP 402 alone decides it; text patterns catch gateways that ship it under another status (opencode's `401 CreditsError`). | `QuotaExhaustedCard` (`quota.tsx`). Switch provider; body names `resets_at` when the provider gave one. |
| `model_unavailable` | `model`, `reason` (`preview_gated` \| `deprecated` \| `region_restricted` \| `unknown`), `suggested_fallback` | The credential is fine but THIS model isn't served to it — Copilot Free answering a premium model with `400 model_not_supported`, NVIDIA's per-account function gate. | `ModelUnavailableCard` (`quota.tsx`). One-click "Switch to `suggested_fallback`" + Pick another model. The one card that reads `credential`: personal scope swaps the body to `shell:providerError.credential.modelUnavailableBody`. |
| `context_overflow` | `model`, `context_window_tokens`, `prompt_tokens` | The conversation no longer fits the window (`exceed_context_size_error`, `context_length_exceeded`, "prompt is too long"). The token fields also feed `learnCustomContextWindow`, which corrects an over-assumed custom-endpoint window. | `ContextOverflowCard` (`quota.tsx`). Switch model. |
| `provider_internal` | `http_status` | 5xx / transient upstream infra failure. | `ProviderInternalCard` (`transient.tsx`). Retry + Check status page (`statusPageUrl` in `shared.tsx`). |
| `network_unreachable` | — | Cannot reach the provider's API (DNS, connect refused, ECONNRESET). | `NetworkUnreachableCard` (`transient.tsx`). Retry + Check status page; a local endpoint gets its own copy keyset. |
| `unknown` | `raw_excerpt` (≤ **300** chars, `EXCERPT_MAX`) — replaces `message` | No classifier branch matched. | `UnknownErrorCard` (`terminal.tsx`). Renders the excerpt verbatim so the card is never content-free, plus Report bug. |

Every kind except `unknown` carries `message`; every kind may carry `credential`
(see below). `unauthenticated` and `network_unreachable` are in
`STATUS_CHANGING_KINDS`, so landing one invalidates the cached provider statuses
— the picker and AI Hub stop offering a provider whose card says it is broken.

### Dormant kinds

`ui/chat/src/types.ts` additionally declares `usage_limit_paused`,
`session_resume_missing`, `malformed_response`, `spawn_failed` and `cancelled`,
and the dispatcher still has cases for them. **No TS backend emits any of them**
(zero hits across `packages/`) — their renderers (`UsageLimitPausedCard`,
`SessionResumeMissingCard`, `MalformedResponseCard`, `SpawnFailedCard`) are
unreachable, and `cancelled` renders `null` by design.

## Where a card comes from

| Path | Where | Notes |
|------|-------|-------|
| pi backend (all non-Anthropic-SDK providers) | `packages/runtime/src/backends/pi/wire.ts` (`turn_end`, `stopReason:"error"`) | Status read from pi diagnostics, else parsed from the message. Held until `agent_settled`; discarded if pi recovers. |
| Claude Agent SDK backend | `packages/runtime/src/backends/claude/translate.ts` → `errors.ts` | `mapSdkError` maps the SDK's own error enum directly (stamping `credential` itself, since it bypasses `classifyProviderError`) and falls through to `classifyText`. One card per turn via the `emittedError` latch. |
| Thrown turn failures | `packages/runtime/src/session/exec-turn.ts` catch · `packages/runtime/src/turn/turn-session.ts` | pi raises missing credentials at prompt time — this catch turns them into the reconnect card, carrying `undelivered_prompt` so the retry re-sends the text pi never recorded. |
| Pre-session guards | `packages/runtime/src/session/chat.ts` (`getConversation` catch + serve-mode pin guard) | Synthesized, not classified — `stampCredentialScope` only. The typed card persists; the LIVE frame is still a generic `error` frame. |

**Precedence** in `classify()` is deliberate and order-sensitive: NVIDIA's
per-account model gate → auth → quota/billing (before rate-limit: both ride 429)
→ rate-limit → context overflow → 5xx → network → model-unavailable → `unknown`.

## The triage loop (how WE find out)

Every classified failure logs exactly once through
`packages/runtime/src/ai/provider-error-log.ts`. `EXPECTED_KINDS`
(`rate_limited`, `quota_exhausted`, `model_unavailable`, `context_overflow`,
`provider_internal`, `network_unreachable`) plus
`unauthenticated`/`no_credentials` go to WARN (Sentry breadcrumb); everything
else — `unknown` and real auth failures — to ERROR (Sentry event). The Sentry
client fingerprints `[provider_error]` lines by
`(provider, kind, cause, sdk-error-slug)`
(`packages/runtime-client/src/sentry/client.ts`; the log line's format is a
documented contract with that regex), so each family is its own countable
issue — cause and the SDK slug joined the fingerprint in PRODUCT-1393 after
the coarser `(provider, kind)` bucket merged a genuine `oauth_org_not_allowed`
family into a `token_revoked` storm under one misleading title. The ritual:
search Sentry for `kind=unknown`, and promote any repeating family into a
classifier branch — verbatim fixture first.

## `credential` — WHOSE account failed

Every kind may carry one extra field:

```ts
credential?: { scope: "personal" | "team" }
```

It is **omitted entirely** unless the turn carried an acting identity, so it is
absent on desktop, self-host, a personal space and every routine run — there is
one credential there and nothing to disambiguate. Treat absence as "render
exactly as before"; never default it.

Populated by `stampCredentialScope` (`packages/runtime/src/ai/provider-error.ts`)
from the per-identity serve record (`packages/runtime/src/auth/served-scope.ts`),
which remembers what the gateway resolved for each `(acting identity, provider)`
pair. Exported separately for the paths that SYNTHESIZE an error instead of
classifying one.

**It NAMES the account; it unlocks nothing.** In a team space every turn runs on
the AI account of the person who sent it and there is no other account to reach
for, so this field buys exactly one thing: a card that tells the truth. No card
gains an ACTION from `credential` — a CTA offering another account could only
ever fail, because the space holds none. Today one card reads it:
`ModelUnavailableCard`, via `credentialScopeOf` (`app/src/lib/credential-scope.ts`,
the one home for these reads). Reconnect is deliberately UNSCOPED on both the
unauthenticated card and the store `ProviderReconnectCard` — the account that
failed is the caller's own by construction.

Full picture: `knowledge-base/teams.md` → "Per-user AI accounts".

## Attribution — `provider` is EVIDENCE, never a guess

A card naming the WRONG provider is worse than one naming none: it sends the
user to a sign-in that fixes nothing. Every layer either proves the provider or
leaves the field empty, and the empty case has its own rendering.

**Engine** (`packages/runtime/src/session/exec-turn.ts`). The catch attributes a
thrown turn to `turnProvider` — the provider `resolveModel` actually resolved
this turn onto, stamped the instant it returns. Then, in order: the turn's own
PIN (canonicalized exactly as `resolveModel` would have, `canonicalPinProvider`,
so a routine pinned to `openai` still names `openai-codex`), then `""` for a
typed card / `"unknown"` for the unknown-kind card (whose copy and bug-report id
interpolate the word). `conv.provider` is NEVER read for attribution: it is the
CACHED session's LAST provider. The label is only half of it — `noteAuthFailure`
and `reportRevokedServedToken` are gated on a NON-EMPTY provider, so a
`resolveModel` throw cannot mark an innocent provider unusable or POST a
revocation for the id `""`.

**Client.** `resolveProviderErrorForChat`
(`app/src/components/shell/provider-error-cards/not-connected.ts`) still fills an
EMPTY provider in, but only with what `errorCardProvider` supplies, and that is
the shared evidence chain `preferredProvider`
(`app/src/components/chat-effective-provider.ts`): the turn's activity pin → the
agent's configured provider → the chat's last-used provider, with empty strings
treated as ABSENT rather than as a pick. The composer
(`resolveEffectiveProvider`) runs the SAME chain and differs only in its last
resort — it defaults to `"anthropic"`, the card does not. No evidence → `null` →
the card keeps `provider: ""`.

**The generic card.** `UnauthenticatedCard` with no provider drops every
brand-specific element (glyph → plug icon, no provider name, no sign-in launch)
and renders the `providerError.unauthenticated` generic keyset —
`titleGeneric` / `bodyGeneric` / `connectProvider`, plus
`reconnectedTitleGeneric` for the done phase (en/es/pt). Its CTA opens the AI
Hub: with no provider there is no `surface`, and a login launch on an unknown id
400s and dead-ends the card. ANY provider's successful `ProviderLoginComplete`
then satisfies it — a SUCCESS is deliberately not filtered by provider on this
path (a FAILURE always is: this card launched nothing) — and fires the same
one-shot auto-resume.

**The composer itself is gated on zero connected providers.** Before any error
can happen, `useAgentChatPanel` replaces the ENTIRE chat input (textarea + the
footer with the model picker) with `ChatConnectAiEmptyState` — reusing the
picker's `chat:modelSelector.picker.noProviders.*` copy and a "Connect an AI
model" CTA into the AI Hub. Decision helper:
`shouldReplaceComposerWithConnectAi` (`app/src/lib/composer-connect-ai.ts`) —
CONFIRMED-zero only: statuses loaded without error, catalog ready, capabilities
loaded, zero connected AND zero still-checking providers; any uncertainty falls
back to the normal composer (no startup flash). Wiring:
`app/src/hooks/use-connect-ai-composer.tsx` → first branch of
`composerOverrideState` (`mode: "replace"`). While active it also suppresses the
store `ProviderReconnectCard` (one CTA, not two). E2E:
`packages/web/e2e/connect-ai-empty-state.spec.ts`.

**Feed dedup upgrades the label in place** (`ui/chat/src/feed-to-messages.ts`).
Provider-error cards dedupe per turn on KIND ALONE; `provider` is deliberately
out of the key, because the same failure routinely arrives unlabeled on one
channel and labeled on the other, and keying on it rendered BOTH. When the card
already shown is the unlabeled one and a duplicate names the provider, the merge
copies the LABEL ONLY onto the existing payload (same message key, so no React
remount): the first card is the one carrying the retry state
(`undelivered_prompt` / `failed_prompt` / `credential` / `retry_after_seconds` /
`raw_excerpt`, often a more specific `cause`), and replacing it wholesale left
auto-resume with nothing to re-send. Accepted edge: a mid-turn backend switch
where BOTH providers fail unauthenticated collapses to one card.

## `token_revoked`: loose for COPY, strict for DESTRUCTION

Both classifiers (`packages/runtime/src/ai/provider-error.ts`
`TERMINAL_SESSION_PATTERNS`, `backends/claude/errors.ts`) map loose phrasings —
"your session has ended", "please log in again" — to `cause: "token_revoked"`,
because "your access was revoked, sign in again" is the right thing to SAY about
any 401 that reads terminal, and being wrong there costs one needless reconnect
prompt. It is NOT the right thing to DO. The revoked-token report
(`packages/runtime/src/auth/report-revoked.ts` → `POST
/sandbox/credential/revoked`) deletes the credential for every runtime in the
workspace, so it gates on its OWN strict list of machine-emitted markers:
`token_revoked`, `has been revoked`, `access revoked`,
`app_session_terminated`, `refresh_token_invalidated`. Anchored phrases, never
the bare word "revoked" — that also matches a negation ("was not revoked") and
unrelated fields (`"revoked_scopes": []`), each of which would sign a whole
workspace out of a live credential. Add loose phrasings to the classifier
freely; add to the report's list almost never. Same asymmetry drives the host's
terminal refresh codes — `knowledge-base/anthropic-credentials.md` → "What may
sign a user out".

The report names the token by digest, and the digest is the token the FAILED
turn actually ran on — captured at request/spawn preparation
(`packages/runtime/src/auth/used-token.ts`: the credential store records at
pi's request-time `read()`, the Claude backend at subprocess spawn, the
per-turn runtime seeds from its hydrated auth.json) and threaded to
`reportRevokedServedToken` as an explicit parameter. NEVER re-derive it from
auth.json at report time: a serve sync or user reconnect between the 401 and
the report swaps in a healthy token, and the gateway's compare-and-delete would
then destroy the fresh credential (PRODUCT-1319). An UNKNOWN used token skips
the report entirely — a missed report costs a retry on the next failed turn, a
mis-aimed one signs the workspace out of a working credential.

## Two auth cards, two copy sets, kept deliberately distinct

The inline `UnauthenticatedCard` and the store-driven `ProviderReconnectCard`
(anchored to the `authRequired` flag, rendered in `ChatPanel.afterMessages`)
answer two different actions — resend a message vs. relaunch sign-in. Their
phase-to-copy mappings are pure, unit-tested lookups:
`resolveAuthCardPresentation`
(`app/src/components/shell/provider-error-cards/auth-presentation.ts`) for the
inline card's 4-phase machine (`idle | waiting | done | failed`), and
`resolveReconnectCardPresentation`
(`app/src/components/shell/provider-reconnect-presentation.ts`) for the store
card's 2-state machine (`loginLaunched`).

**Prefer the persisted inline card.** The store card AUTO-DISMISSES for codex:
its 3s `checkStatus` poll sees `~/.codex/auth.json` still present and clears
`authRequired`, so the login button flashes then vanishes. So
`use-agent-chat-panel.afterMessages` suppresses the store card whenever the feed
already carries an inline `provider_error` `unauthenticated` card
(`isInlineAuthCard`), REGARDLESS of which provider that card names — it carries
the provider the turn actually failed on, which outranks the chat-provider
resolution chain. `afterMessages` receives the RAW (unfiltered) feed
(`@houston-ai/board` `ai-board.tsx`), so that check can see the item.

The inline card is split by CONCERN, not by variant, and the split is why each
half is testable: `auth.tsx` renders only what the other three decide,
`auth-presentation.ts` maps phase → copy, `use-provider-login.ts` owns every
side effect (cancel → relaunch, the `ProviderLoginComplete` subscription, the
one-shot auto-resume, the AI-Hub fallback when no provider is named), and
`reconnect-surface.ts` routes a provider id to its connect surface. That last
one exists because sending an api-key provider through an OAuth login launch is
a guaranteed 400 ("nvidia does not use OAuth sign-in") that flips the card to
its failed phase and dead-ends the user: api-key providers reconnect through the
same paste dialog Settings uses (`reconnect-dialog.tsx`), `openai-compatible`
through the guided endpoint dialog, and both fire the same
`ProviderLoginComplete` so the auto-resume runs on every surface.

**Where the card actually mounts (don't let this regress).** A `provider_error`
feed item becomes a `ChatMessage` with `providerError` set and `content: ""`
(`ui/chat/src/feed-to-messages.ts`). The ONLY thing that renders it is the app's
`renderSystemMessage` (`app/src/components/use-agent-chat-panel.tsx`), which
must return `<ProviderErrorCard error={msg.providerError} … />`.
`ui/chat/src/chat-messages.tsx` calls `renderSystemMessage(msg)` and, if it returns
`undefined`, falls back to rendering `msg.content` — which is `""`, i.e.
NOTHING. Adding a variant to the dispatcher in `provider-error-card.tsx` is
necessary but NOT sufficient; the card only appears because
`renderSystemMessage` mounts it.

## Codex sign-in port (1455) already in use — preflight

**Symptom (desktop, real users):** with the real Codex CLI running — or a stray
prior login holding the port — *Connect OpenAI* opens the browser, the user
approves at OpenAI, and Houston spins for ~5 minutes into a generic timeout
toast. No log, no error, no remedy.

**Cause:** the OpenAI/Codex **browser (loopback)** login binds a FIXED loopback
callback port, `1455`, in pi's host process (pi-ai
`utils/oauth/openai-codex.ts` → `startLocalOAuthServer`, mirroring its
hardcoded `REDIRECT_URI = "http://localhost:1455/auth/callback"`). pi attaches
`.on("error", …)` to that server WITHOUT rethrowing: on `EADDRINUSE` it resolves
a **stub** whose `waitForCode()` returns null. The browser still opens, the
redirect lands on whoever holds `1455`, and the flow waits for a manual code
that never comes — until the 10-min abandonment expiry. pi is an external
dependency; its dist can't be patched.

**Fix (`packages/runtime/src/auth/codex-port-preflight.ts`):** BEFORE handing
off to pi, `startLogin` probes the exact `host:port` pi will bind (`1455`, host
mirrors pi's `PI_OAUTH_CALLBACK_HOST || 127.0.0.1`) by binding + immediately
closing a throwaway listener. A bind error throws the typed
`CodexCallbackPortInUseError` (`kind: "codex_callback_port_busy"`) with a
non-technical message — *"Another app on this computer is using the sign-in port
(1455). Close other AI coding tools and try again."* — so the failure is instant
and actionable, **before any browser opens**. It runs ONLY for the
`openai-codex` **browser** method (`deviceAuth:false`), and before any state is
added to `active`, so a preflight failure never wedges the login slot.

**Surfacing:** the runtime returns the typed error over REST with its `kind`
(`packages/runtime/src/transport/provider-routes.ts`). The frontend engine adapter
(`packages/web/src/engine-adapter/client/provider-login-mixin.ts`,
`surfaceTypedLoginFailure`) routes any `kind`-tagged login-launch failure
through the normal `ProviderLoginComplete{success:false, error}` channel, so the
actionable message reaches the existing sign-in toast / reconnect card instead
of being flattened to a generic "sign-in failed". Untyped failures rethrow
unchanged. Login failures are NOT `ProviderError` variants — they never render
as session cards.

## File map

| Layer | Path |
|-------|------|
| Wire type | `packages/protocol/src/provider-error.ts` |
| Classifier | `packages/runtime/src/ai/provider-error.ts` (+ `provider-error.test.ts`) |
| Logging / Sentry | `packages/runtime/src/ai/provider-error-log.ts` · `packages/runtime-client/src/sentry/client.ts` |
| Credential scope | `packages/runtime/src/auth/served-scope.ts` · `app/src/lib/credential-scope.ts` |
| Revoked report | `packages/runtime/src/auth/report-revoked.ts` |
| Codex port preflight | `packages/runtime/src/auth/codex-port-preflight.ts` |
| Entry points | `packages/runtime/src/backends/pi/wire.ts` · `backends/claude/translate.ts` + `errors.ts` · `session/exec-turn.ts` · `turn/turn-session.ts` · `session/chat.ts` |
| Frontend union | `ui/chat/src/types.ts` |
| Card router | `app/src/components/shell/provider-error-card.tsx` |
| Card pieces | `app/src/components/shell/provider-error-cards/` — `limits.tsx`, `quota.tsx` (the one that names the account), `transient.tsx`, `terminal.tsx`, `shared.tsx` (`ErrorCard` / `RetryButton` / `StatusPageButton` / `statusPageUrl` / `providerLabel`, re-exports `ReportBugButton`) |
| Auth card | same dir: `auth.tsx` (render only) · `auth-presentation.ts` (phase → copy) · `use-provider-login.ts` (launch / cancel / auto-resume) · `reconnect-surface.ts` (which surface an id opens) · `reconnect-dialog.tsx` (the two non-OAuth ones) · `not-connected.ts` (`errorCardProvider`) |
| Attribution | `packages/runtime/src/session/exec-turn.ts` · `app/src/components/chat-effective-provider.ts` · `ui/chat/src/feed-to-messages.ts` |
| i18n | `app/src/locales/{en,es,pt}/shell.json` → `providerError.*` |
