# Custom integrations (user-added APIs & MCP servers)

Services the Composio catalog does not offer. A second `IntegrationProvider`
implementation behind the same port, provider id **`custom`**
(`packages/host/src/integrations/custom/`). The Composio side is
[integrations.md](integrations.md).

## Engine

- The engine is the embedded **executor SDK** (`@executor-js/sdk` +
  `plugin-openapi` + `plugin-mcp`, MIT, pinned EXACT — pre-1.0), wrapped entirely
  behind the port. Nothing executor-shaped leaks past the adapter. The packages'
  root type entries are broken, so imports go through the `/core` subpaths.
- **Key-free and always on.** `buildLocalHost` registers the custom provider
  unconditionally (beside Remote/Composio when configured) — definitions and
  secrets live on THIS host's disk, so an install with no Composio key, or a
  signed-out desktop, still serves it. `capabilities.integrations` therefore always
  contains `"custom"`.
- **Houston owns persistence; the executor is a compiled view.**
  `CustomExecutorHost` lazily builds ONE in-memory executor and rehydrates every
  definition into it (addSpec/addServer + an org/`default` connection per def); a
  definition that fails to compile degrades to state `error` for itself only.
  Secrets reach requests through a Houston `CredentialProvider` (`secrets.ts`)
  resolved lazily — the executor never copies values.
- All manager mutations (add / replace / setCredential / remove) are serialized
  through ONE queue, so the def store, secret store, compiled executor and state map
  can never interleave into disagreement.

## Storage + custody

- `custom-integrations.json` holds definitions next to `credentials.json`.
- Local / self-host: `custom-integration-secrets.json` is the 0600 secret store.
  The write is platform-correct — 0600 asserted on POSIX; on Windows (no POSIX
  modes; NTFS ACLs under the user profile are the protection) it skips chmod and
  clears a stray read-only attribute before its rename-replace.
- Managed cloud: `RemoteCustomSecretStore` sends values over the agent's
  host-token-authenticated gateway route into **GCP Secret Manager**; no value is
  written to the agent-data store. At the first managed boot after upgrade the host
  hydrates the legacy file, uploads every entry, and removes it only after ALL
  writes succeed; the following sync deletes the old GCS object. A partial migration
  leaves the whole file intact for safe retry.
- **Cloud custody**: definitions are agent data, values are agent-scoped Secret
  Manager secrets. Engine pods have no GCP IAM; only the gateway can resolve the
  deterministic non-PII resource id.
- **Rollout and rollback are COUPLED.** A gateway without Secret Manager custody
  (old image, or `GW_SECRET_MANAGER_PROJECT` unset outside dev) answers the pod
  custody routes 401, so a new-image managed pod fails every custom-secret read.
  Rolling the gateway's custody flag back requires pinning the engine image back in
  the same step. The Anthropic credential is NOT part of this custody — the
  gateway's central store is its single custodian
  ([anthropic-credentials.md](anthropic-credentials.md)).

## Definition shape

Discriminated union (`custom/types.ts`):

- `openapi` — spec `url` | `blob`, optional `baseUrl`.
- `mcp` — remote endpoint, optional headers.
- Plus `auth: "none" | "credential" | "oauth"` and an optional stored `credential`
  `{template, secretIds}`.
- State per def: `active` (with `toolCount`) / `pending` (needs a key — or, for an
  `oauth` def, the user's browser sign-in; authMethods carry the collectible fields,
  v1 is ONE `token` variable per method) / `error`.
- The view carries `auth` (the UI's Sign-in-vs-Enter-key branch) and a derived
  `iconUrl`.

**Actions are executor addresses.** A custom ToolMatch's `action` is
`tools.<integration>.<owner>.<connection>.<tool>`; `toolkit` is the integration
slug. The sandbox routes a `tools.`-prefixed action to the `custom` provider
(`providerForAction`, `CUSTOM_ACTION_PREFIX`).

**Sandbox proxy fans out.** `/sandbox/integrations/search` with no explicit provider
queries ALL registered providers and merges (a failing provider never hides
another's results; an all-empty merge rethrows a SigninRequired if one occurred).
Execute routes by action shape and is capped at **120s** so a hung upstream can
never wedge the turn.

## Transport guard (HOU-1083)

The executor gets its OWN HTTP seam (`fetch-guard.ts`: `httpClientLayer` + `fetch`
in `buildExecutor`) instead of inheriting process-global fetch state.

- Why: Effect's HttpClient sets an explicit `content-length` on every sized body.
  In a host process where pi has installed npm undici's fetch over Node's bundled
  copy, that header landed on the wire twice and undici v8 rejected the merged
  value — EVERY custom POST/PUT failed with `UND_ERR_INVALID_ARG: invalid
  content-length header` while GETs worked.
- The guard strips message-framing / hop-by-hop headers (content-length,
  transfer-encoding, connection, host, …) before delegating to the CURRENT
  `globalThis.fetch`, so every implementation computes the one correct value itself,
  on any Node/Bun/undici mix.
- `createExecutor` in `@executor-js/sdk` 1.5.37 silently dropped
  `httpClientLayer`/`fetch` from its config allowlist —
  `patches/@executor-js__sdk@1.5.37.patch` forwards them. Worth an upstream PR;
  **re-check on every executor bump** (`fetch-guard.test.ts` fails loudly if the
  guard stops reaching the wire).

## Replace = the agent's self-repair path (HOU-1083)

- `add` with `replace: true` (same slug, same kind) swaps the spec in place through
  the uncompile → recompile sequence, keeping `addedAtMs`.
- The stored credential carries over ONLY when `service-origins.ts` proves the
  replacement talks to the same service (equal server/endpoint origins; url-kind
  specs need the identical document URL; anything indeterminate counts as changed).
  A changed origin drops the carry, deletes the now-unreferenced secret, and lands
  the def `pending` — otherwise a prompt-injected spec pointing at an attacker host
  would receive the user's key on the next action.
- Within the same service the carry IGNORES the input's `auth`: replace is
  spec-repair, and a model re-deriving `auth` must not discard a working key with a
  sloppy `"none"` replay.
- A replacement that fails to compile is uncompiled again and the previous view
  restored — a working integration is never traded for a broken spec.
- The product prompt (`houston-prompt.ts` + the Rust twin
  `app/src-tauri/src/houston_prompt/integrations.rs`) makes discovery
  deterministic: search published spec → llms-full.txt/llms.txt → docs pages, in
  that order; author COMPLETE specs (every documented operation); compare the
  compiled action count against the docs and `replace: true` until they match. Never
  a second integration for the same service.

## Spec freshness

The compiled view is process-long (hours on a pod, weeks on a desktop), so
url-sourced OpenAPI specs get a stale-while-revalidate verify:

- Any `ensure()` past a **6h TTL** arms ONE background `refreshSpecs()` sweep:
  re-fetch each url spec, sha256-compare, and recompile ONLY a def whose content
  actually changed (removeSpec + compileDef, the same sequence remove + re-add
  runs, connection included).
- An unreachable spec host keeps the working view. A first sweep records baselines
  without recompiling. Blob specs are frozen by design and MCP tool lists are
  discovered live per listing, so neither is swept.
- Nothing ever blocks a chat turn on a spec fetch, and nothing refetches per request.

## OAuth sign-in for MCP servers (PRODUCT-1172)

An OAuth-walled MCP server is no longer a dead end — Houston IS the OAuth client.

- `custom/oauth-flow.ts` runs discovery (RFC 9728 protected-resource → RFC 8414 AS
  metadata via `@modelcontextprotocol/sdk`'s client auth module, a direct exact dep
  of the host), dynamic client registration (RFC 7591; the client is reused across
  re-auths while the redirect URI matches), and mints a PKCE authorize URL with a
  random single-use, 10-min `state` (in-memory `CustomOAuthAttempts`, one pending
  attempt per slug).
- The browser lands on the PUBLIC callback `GET
  /v1/integrations/custom/oauth/callback`
  (`routes/custom-integrations-oauth.ts`), mounted BEFORE `principal(...)` — the
  state is its whole authentication; the response is a tiny self-contained
  close-this-tab page.
- Completion (`custom/oauth-ops.ts`, serialized like every manager mutation)
  exchanges the code, writes a **token bundle** (`custom/oauth-bundle.ts`: tokens +
  client + AS metadata + resource, versioned JSON) into the secret store under the
  SAME `ci_<slug>_token` id a pasted key would use, sets `credential
  {template, secretIds}`, reconnects, and emits `CustomIntegrationsChanged` — the UI
  flips on the event, no client poll.
- **Refresh needs no rewire**: the executor resolves connection inputs through
  `houstonCredentialProvider` PER REQUEST, and its `get` recognizes a bundle value
  and serves the CURRENT access token (`resolveOAuthValue` — 60s skew,
  single-flight per id, rotated bundle persisted; an expired grant with no refresh
  token throws "sign in again"). MCP servers registered with any non-`none` auth get
  the `Authorization: Bearer` header template.
- **Deployment gating** — capability `customIntegrationOAuth` (`/v1/capabilities`),
  on exactly when the host can serve a browser-reachable callback: a loopback-bound
  local host derives `http://127.0.0.1:<port>` (the desktop sidecar and `pnpm dev`'s
  host pane); self-host opts in with `HOUSTON_OAUTH_CALLBACK_BASE_URL`; managed pods
  stay OFF until the gateway serves a callback route.
- `detect` decorates a `requiresOAuth` result with `oauthSupported`, so the agent
  tool and the manual add form branch on the HOST's answer, never a guess:
  supported → add with `auth:"oauth"` (the add form hides the key switch and chains
  straight into the browser; rows/detail show **Sign in** / **Sign in again**,
  `useStartCustomOAuth`); unsupported → the honest "can't connect yet" verdict blocks
  the add.

## Credentials without a security scheme (the PriceLabs fix)

Many real specs (and agent-authored ones) declare NO `securitySchemes` — the key is
just a documented header. That dead-ended the secure save with `credential_invalid`
on every attempt while pasting the key in chat worked (the worst possible incentive).

- Compile now injects a synthesized `houston_fallback` method for credential-mode
  OpenAPI defs with no collectible method (`custom/fallback-auth.ts` →
  `executor.openapi.configure`). Placement is derived from the spec's own
  api-key-shaped header/query parameter (`X-API-Key`-like names; an `Authorization`
  param gets `Bearer `), else the `Authorization: Bearer` default the MCP path uses.
- The executor is in-memory, so every rebuild re-injects the SAME slug before the
  stored credential's connection re-renders through it.
- `setCredential` also heals defs added as `auth:"none"` (a later
  `request_credential` upgrades them); residual failures (uncompiled def; MCP def
  with no declared method) carry actionable messages.

## Icons

`custom/icon.ts` derives a service favicon at VIEW-BUILD time (never persisted):
MCP endpoint host / `baseUrl` / spec URL / a blob spec's first `servers[]` origin →
strip one technical label (`www|api|mcp`) → Google S2 favicon URL (the same service
`app-display.ts`'s `fallbackLogo` uses; IP / localhost / single-label hosts yield
none). `AppLogo`'s per-URL failure latch keeps the letter avatar as fallback.
Carried as `CustomIntegrationView.iconUrl` into the custom rows, the detail dialog,
and the chat process-header brand line — the wrench glyph is now the no-icon path
only.

## Agent-driven setup (chat, never a form)

Three gated runtime tools
(`packages/runtime/src/session/tools/custom-integrations.ts` +
`request-credential.ts`):

- `custom_integration_detect` — classify a pasted URL (`integrations.detect` + an
  MCP probe).
- `custom_integration_add` — register + compile. Management routes:
  `/sandbox/integrations/custom/{detect,add}`, HMAC-authed.
- `request_credential` — records a `{kind:"credential", toolkit, reason?}`
  interaction step (protocol `interaction.ts`, ids `k1..kN`, auto-excluded from
  Autopilot) that replaces the composer with a SECURE key-entry card.

The secret travels UI → `POST
.../integrations/custom/definitions/:slug/credential` on the **per-agent surface**
→ validate (`connections.validate`, fail-open on `unknown`) → secret store →
connection rewire. **It never enters the transcript**; the prompt forbids asking for
keys in chat.

## Routes

`routes/custom-integrations-user.ts` (the sandbox detect/add routes stay in
`routes/custom-integrations.ts`):

- `GET`/`DELETE` `definitions[/:slug]`
- `POST` `definitions/:slug/credential`
- `POST` `definitions` — add; body is the SAME grammar as the agent's sandbox add
  tool (`parseAddInput` is the one validator), called by BOTH the agent tool and the
  client's manual add form (HOU-980).
- `POST` `detect` — classify a pasted URL.
- `GET` `definitions/:slug/tools` — the compiled tool list behind one definition
  (`manager.tools(slug)` over `custom/tools.ts` `toolsOf`); the count always agrees
  with the row's `toolCount`.

One grammar (`customTargetOf` in `custom-integrations.ts`) serves three surfaces:
top-level `/v1/integrations/custom/*` (mounted BEFORE the generic
`/v1/integrations/:provider/*` catch-all), the `/v1/agents/:id/integrations/custom/*`
wrapper, and the per-agent dispatch `/agents/:id/integrations/custom/*`.

- **The dispatch form is the one shipped clients call** (HOU-823): the hosted
  gateway proxies ONLY per-agent routes to a pod and its own `/v1/integrations`
  subtree is Composio-only, so the top-level POST 404ed at the gateway and every
  managed-cloud secure-card save failed. The data stays user-global; the agent id
  authorizes and routes.
- The gateway's dispatch-scope classifier treats this family as **configure-scope
  (fail-closed)**, so in a Teams org only agent managers can save/remove — a
  member-facing use-scope carve-out is a gateway follow-up.
- Errors carry stable `code`s (`not_found`, `duplicate_slug`, `credential_invalid`,
  `compile_failed`, …). Mutations emit `CustomIntegrationsChanged` (protocol
  `events.ts`) → query invalidation.
- **Every client surface rides the per-agent form whenever an agent exists.**
  `CustomIntegrationsSection` takes an optional `agent`; agent-less surfaces (the
  global page + its tab chip, screen prefetch, chat brand resolution) resolve a
  transport agent via `useCustomTransportAgentId` (`use-custom-integrations.ts`) —
  the FIRST agent's routes, valid because the data is user-global — falling back to
  the top-level form only when no agent exists yet. That fallback is what makes the
  global page's Custom tab work behind the hosted gateway instead of hiding behind a
  404→null degrade.
- `agentId?`-aware hooks: `useCustomIntegrationsFor`, `useAgentCustomIntegrations`,
  `useDetectCustomIntegration`, `useAddCustomIntegration`,
  `useRemoveCustomIntegration`, `useSubmitCustomCredential`. Engine-client + adapter
  carry the matching `...AgentCustomIntegration...` methods in
  `custom-integrations-mixin.ts`.

## UI

- **Home: the global Integrations page's Installed strip.** Custom rows render in
  the same `CatalogGrid` as the connected catalog apps, after them, behind the
  shared preview cap; the page's ONE search and the category filter's pinned
  **Custom** entry narrow them (`filterInstalledBy`'s `"custom"` branch keeps
  custom rows only and the page drops the Available section). The page machinery
  — list, setup chat, draft banner, dialogs, loud load-error state — is
  `integrations/use-custom-integrations-surface.tsx` (`useCustomIntegrationsSurface`
  + `AddCustomButton` + `CustomSurfaceSupport`). With no custom source served
  (list resolves `null`) the filter entry and the Add button don't exist.
- Rows are `CustomIntegrationRow`: leading letter avatar (or `iconUrl`),
  transparent-at-rest `hover:bg-hover`; the row body opens the detail card.
- **"Add custom integration"** — the header's primary button — goes STRAIGHT to
  the guided chat (the manual form `custom-add-*.tsx` stays in the tree,
  deliberately unwired, until discovery is deterministic enough for a raw form):
  - **The chat.** It resolves its agent without asking
    wherever it can (an agent passed in, else the workspace's only agent) and
    interposes `AgentPickerDialog` only for a genuinely multi-agent workspace. The
    chat opens in the shell-level RIGHT panel (the same one routine chat and the
    mission board use), so the Integrations surface stays visible on the left. Only
    the VISIBLE instance drives that shared panel — kept-alive views leave every
    instance mounted, so `integration-setup-chat.tsx` gates on `active`, fed from
    `viewMode === INTEGRATIONS_VIEW_ID`. The kickoff prompt
    (`lib/integration-chat-setup.ts`) explicitly states the user is present and
    `ask_user` works — a "Houston sent this automatically" framing once made the
    model refuse the interview.
  - **QUIET path — "Add manually"** (`CustomAddForm` + the pure, node-tested
    `custom-add-model.ts`): kind (API / MCP server), URL with an optional "Check"
    (detect pre-classifies, fills the name, and flips "needs an API key" on a
    key-walled server), name, and the key switch. The verdict is keyed to the URL it
    judged and latest-check-wins (`checkSeq`), so a late probe can never claim an
    edited address. Detect + add ride the TRANSPORT agent's per-agent routes.
  - A successful add SEEDS both list caches before invalidating (the row appears
    without waiting on the refetch); an add that needs a key lands `pending` and
    chains straight into the secure key dialog.
- **Detail dialog** — every custom row's body opens `CustomDetailDialog`: letter
  avatar, kind + live-status chips, URL + added date + the action COUNT (the
  per-action list was cut as noise; the `tools` route stays as API). Footer:
  Enter/Update key beside Remove. The trio (detail / key / delete) hangs off ONE
  slug-keyed selection (`custom-integration-dialogs.tsx` — `useCustomSelection` +
  `CustomIntegrationDialogs`), re-deriving the fresh view from the live list so a key
  save flips the open card to active and a removal closes it.
- **In-chat credential card**
  (`app/src/components/chat-credential-interaction-card.tsx`) is a first-class
  citizen of the `InteractionModal` shell, mirroring the connect card: a key-glyph +
  integration-name header, the reason line over the shared `CustomCredentialForm`
  (externalized submit via `formId`/`hideSubmit`/`onReadyChange`), and a footer with
  "Save key" beside the unified "Skip" (Esc). A saved key auto-continues; a SKIPPED
  key is a recorded fact the completed reply states ("Skipped adding the {name}
  key.", `chat:credential.skippedLine`; `finalCredentialNames` mirrors
  `finalConnectNames`) so the agent stops waiting. Hidden when the host 404s the
  definitions route (engine-client returns `null`).
