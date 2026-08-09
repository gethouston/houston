# AI providers + model wiring

Which LLM a turn runs on: the provider catalog, the chat model picker, reasoning
effort, turn mode, and mid-conversation provider switching. The **AI Hub** (the
connect/browse surface) is [ai-hub.md](ai-hub.md).

> **There are no provider CLIs.** pi talks to every provider in-process. The
> bundled claude/codex/gemini CLIs and the whole CLI-bundling pipeline are gone.
> Gemini survives as the API-key provider `google` — there is no `gemini` id.

## The catalog: one wire source, three consumers

- **`GET /v1/catalog`** (`packages/host/src/routes/catalog.ts` +
  `providers/pi-catalog.ts`) returns the wire `ProviderCatalog`
  (`@houston/protocol` `provider-catalog.ts`): every runnable provider (~35) and
  model (~979) with pricing / context / maxTokens / reasoning / vision /
  `thinkingLevels`. Built from pi-ai's **baked in-process registry** — no egress,
  no key — so the set is runnable-by-construction and byte-identical on desktop
  and inside a managed pod. No profile gating.
- **Runtime registry**: `packages/runtime/src/ai/providers.ts`. **Host catalog**:
  `packages/host/src/providers.ts` (ids + auth method only; the runtime owns model
  lists). **Frontend catalog**: `app/src/lib/providers.ts` (`PROVIDERS`, seeded
  then hydrated by `hydrateProviderCatalog(catalog)`).
- `use-provider-catalog.ts` is the SOLE owner of the `["provider-catalog"]`
  query. It calls `getEngine().getCatalog()` directly (not the toasting `call()`
  wrapper) so it renders its own `providers:toast.catalogLoadFailed`. A failure is
  never swallowed: the adapter's `getCatalog` throws on 404 (every current host
  and the e2e fake host serve the route, so a 404 means a stale sidecar), and both
  an error AND a 200-but-empty payload raise the toast while the seed keeps the UI
  rendering. Silently emptying the picker is the bug that shipped v0.5.2 with
  providers but zero models.
- The live-OpenRouter fetch is retired: `GET /v1/providers/openrouter/models`, the
  `openrouter-catalog` mapper, the `LiveCatalog` wire type and
  `listProviderModels`/`listModels` are deleted.

## Provider ids and overrides

- Auth kinds: **subscription OAuth** (`anthropic`, `openai`, `github-copilot`),
  **API key** (`opencode`, `opencode-go`, `openrouter`, `google`,
  `amazon-bedrock`, `minimax`, `deepseek`, `groq`, `mistral`, `xai`, … — pi
  built-ins, no adapter file), and **`openai-compatible`** (a pasted local
  endpoint; see [local-models.md](local-models.md)).
- **`openai-codex` → `openai` rename.** pi-ai's OAuth OpenAI provider is
  `openai-codex`; the frontend card/logo/connect uses `openai`.
  `PROVIDER_ID_RENAME` (`app/src/lib/provider-overrides.ts`) applies it on hydrate
  and `PROVIDER_ID_UNRENAME` maps back on write. pi's DIRECT api-key `openai`
  provider is dropped first (`DROP_PI_PROVIDERS`) so the rename can't collide.
- `PROVIDER_OVERRIDES` (`provider-overrides.ts`) is Houston's curation layer over
  pi: display name, blurb, `billing`, `defaultModel`, `gatewayIds`, and per-model
  `models[id]` presentation. `PROVIDER_OVERRIDES[].models[id].effortLevels` is an
  escape hatch for a genuine gateway-imposed cap only — no override sets it today,
  and `app/tests/provider-overrides-drift.test.ts` fails the build if an override
  names a model id the vendored pi-ai registry doesn't carry.
- **Adding a provider** = a pi-runtime + config-mapping concern: the runtime
  registry, the host catalog, the protocol `ProviderId`, and the frontend
  catalog/logo. No adapter file, no dispatch arms, no CLI.

### Provider quirks worth knowing

- **OpenCode Zen + Go are ONE connect card.** Two distinct pi gateways
  (`opencode.ai/zen/v1` vs `.../zen/go/v1`, disjoint model catalogs) authenticated
  with the SAME opencode.ai key (pi reads `OPENCODE_API_KEY` for both).
  `getConnectProviders` collapses them; `gatewayIds` lists both;
  `credentialSiblings` (`synthetic.ts`) fans the pasted key out and
  `setProviderApiKey`/`providerLogout` loop over it (one
  `ProviderLoginComplete`). Status is OR'd (`tauriProvider.checkMergedStatus`).
  The **model picker keeps them as separate sections** — picking the model picks
  the gateway, and opencode.ai enforces Go-subscription vs Zen-credit entitlement
  per request (surfaced as a provider-error card).
- **GitHub Copilot** is subscription OAuth via GitHub **device code**. pi-ai's
  login prompts for an optional Enterprise URL; `login.ts`
  `autoPromptAnswer(provider, domain?)` answers it programmatically (`""` ⇒
  github.com) to avoid a deadlock. Curated models use pi-ai's DOTTED Copilot ids
  (`claude-sonnet-4.6`, not `claude-sonnet-4-6`). LOCAL-only — cloud egress isn't
  allowlisted.
  - **Plan gating:** on Copilot Free (`sku=free_limited_copilot`) the editor API
    serves only base models and answers any premium model `400
    model_not_supported`. Default Copilot model is therefore **`gpt-4.1`**
    (`config.githubCopilotModel`), and the runtime classifies
    `model_not_supported` → a typed `model_unavailable` provider error
    (`ai/provider-error.ts`) rendering the switch-model card with `gpt-4.1` as the
    fallback.
  - **Enterprise is not a second card.** pi has one Copilot slot, so the single
    card's connect opens a Personal-vs-Company dialog
    (`provider-copilot-connect-dialog.tsx` via `useCopilotConnect`); Company
    threads the firm's GitHub domain as a non-secret `enterpriseUrl` through the
    credential path + central refresh (`api.<domain>/copilot_internal/v2/token`).
- **Amazon Bedrock** is special only at the runtime edge: the stored key is
  mirrored from pi-coding-agent's generic `apiKey` option to pi-ai's
  Bedrock-specific `bearerToken` in `packages/runtime/src/ai/bedrock.ts`.

## Where the pin lives

Each agent's `.houston/config/config.json` carries the provider + model + effort;
`app/src/lib/default-provider-model.ts` `pickDefaultProviderModel` resolves the
seed against **confirmed-connected** providers only (last-used if still connected,
else the first connected provider in `PROVIDERS` order, else the legacy anthropic
fallback). An EMPTY statuses map is indeterminate and never resets the seed. If
nothing is confirmed, the visible fallback is NOT written by `finishAgentSetup` and
NOT passed as a turn override.

## The chat model picker

`@houston-ai/core` `ModelPicker`
(`ui/core/src/components/model-picker/`) — a **two-level command menu** in the
app's shared dropdown idiom (Popover + cmdk, same row vocabulary as
`FilterCombobox`). App wiring: `app/src/components/chat-model-selector.tsx`.

- **Level 1 = connected providers only** (BrandMark + name, check on the selected
  model's provider, drill-in chevron) plus a quiet **"Connect more providers…"**
  footer. **Disconnected providers never appear** — the footer is the only path to
  one, and it navigates to the AI Hub (`setViewMode("ai-hub")`).
- **Level 2** = back header + that provider's model rows (name, one-line
  description, check). An in-dropdown `CommandInput` appears only once the list
  runs long (> 8 rows) and filters via cmdk's scorer. The old always-visible
  global cross-provider search (`searchModels`/`matchRange`) was removed.
- Keyboard: cmdk roving; Escape clears an active query then steps back; Backspace
  on empty query steps back. The Command is keyed per screen (fresh cmdk state).
  Sizes to content (`max-h-[360px]`); the popover supplies border/shadow/radius.
  Library component is props-only and i18n-agnostic (`labels?`).
- **Curated-first ranking.** pi's raw order is often oldest-first, so
  `chat-model-picker-map.ts` re-ranks each provider's rows with `rankCuratedFirst`:
  models carrying a `PROVIDER_OVERRIDES[provider].models` entry lead in override
  (curation) order, then the rest in catalog order.
- **Row ids encode the pair** as `` `${provider}::${model}` `` (split on the FIRST
  `::`), decoded on select into `handleModelSelect(provider, model)` — so
  `ProviderSwitchDialog` consent, effort, and persistence are untouched. Each row
  carries only `{ id, providerId, name, description }`; the models.dev
  capability/price enrichment lives in the AI Hub, not here.
- **Loading is neutral, never "no providers"** (`providerListLoading()` in
  `catalog.ts`, `providerPickerState(...)` in `app/src/lib/model-picker.ts`).
- **Open-catalog providers accept any live id.** `validModelOrNull`
  (`app/src/lib/providers.ts`) would null anything outside a provider's curated
  list, silently reverting a live OpenRouter pick; `isOpenCatalogProvider`
  (`openrouter` + `openai-compatible`) short-circuits it. Caveat: the RUNTIME still
  resolves ids through pi-ai's generated registry, so a brand-new id outside it
  persists but fails the turn at `safeGetModel` with a clean "model not available".
- **One selector, three surfaces.** `ChatModelSelector` also renders in the import
  wizard (`portable/import-wizard.tsx`) and the create dialog's `ai-assist-step.tsx`
  with `agent={null}` (never locks). `naming-step.tsx` uses the sticky default. The
  old hand-rolled `InlineModelSelector` is gone.
- **Favorites/recents storage survives but is not surfaced**: the
  `favorite_models` / `recent_models` prefs and `use-model-favorites.ts` still
  exist; the picker renders neither.
- Deleted in the minimal redesign: per-row Connect buttons, provider rail,
  favorites/recents groups, FilterPopover, SortMenu, result-count row, model detail
  panel, `chat-model-picker-enrich.ts`, the in-picker
  `ProviderConnectionDialogs`/`useProviderConnections` stack.

## Reasoning effort

- Four tiers ascending: `low`, `medium`, `high`, `xhigh` (`EffortLevel`,
  `app/src/lib/providers.ts`). `DEFAULT_EFFORT = "medium"`.
- A fifth `max` tier was removed — it produced byte-identical requests to `xhigh`.
  A persisted `"max"` normalizes to `xhigh` on read (`normalizeEffort`), and the
  runtime's wire mapping (`toThinkingLevel`,
  `packages/runtime/src/ai/effort.ts`) still accepts it, so an unmigrated agent runs
  correctly. `ui/agent-schemas/src/config.schema.json` + `app/src/data/config.ts`
  keep it in the type for that reason.
- **Per-agent and model-gated.** Stored as `effort` in the agent's config, set from
  the model picker, which shows only levels the active model accepts
  (`getEffortLevels`). `validEffortOrDefault` resolves the level actually used:
  requested if accepted, else `medium` if offered, else the model's lowest; a model
  with no effort control gets `undefined` and the flag is omitted.
- **Levels derive from pi, not a hand table.** `deriveEffortLevels` maps each
  model's pi-ai `thinkingLevels` onto the four-tier scale, dropping pi's
  `off`/`minimal`.

## Turn mode

A separate per-turn "Mode" pill sits beside the model + effort controls in the
composer footer: **Planner** (`plan`, read-only investigation), **Coworker**
(`execute`), **Autopilot** (`auto`, no blocking tools). Unlike effort it is NOT
synced through Settings. Mechanics, runtime enforcement (tool clamp + overlay) and
the "forgotten `modeOverride` silently degrades to execute" gotcha:
[architecture.md](architecture.md) → *Turn modes*.

## Switching provider mid-conversation

The picker is **never locked**. Provider sessions aren't portable, so the engine
runs a FRESH session on the new provider seeded with prior context, reusing the
compaction machinery:

- **Fits the target window** → `replay`: the full transcript carried verbatim.
  Lossless; costs a reload of the conversation.
- **Doesn't fit** → `summarize`: compacted by the TARGET provider. Lossy + one
  summarizer call.
- **Both modes ask first** via `ProviderSwitchDialog` (both spend tokens, scaling
  with conversation size), with mode-specific copy. Staged only on confirm.

- The size decision is `decideHandoffMode` (`app/src/lib/provider-switch.ts`),
  reading the SAME per-model window numbers autocompact uses: `resolveModelWindow`
  / `effectiveModelWindow` (`@houston/protocol/model-windows`, a dependency-free
  subpath export) is the ONE `{default, max}` table, imported by both the frontend
  catalog and `packages/runtime/src/session/exec-turn.ts`. `default` is the
  starting estimate; it snaps UP to `max` once observed usage exceeds it, proving
  the larger (plan-gated) window is live. Anthropic flagships default 200k, snap
  to 1M.
- `normalizeUsage` (`packages/runtime/src/backends/pi/wire.ts`) synthesizes
  `context_tokens` from component fields when a provider omits a summed
  `totalTokens`, so an under-reporting provider still feeds the estimate.
- The choice is staged in `app/src/stores/provider-switch.ts` and forwarded on the
  next send as `POST .../sessions { providerSwitch: { mode, fromProvider } }`. The
  engine clears the resolved provider's current resume id (so switching BACK never
  resumes a session missing the other provider's turns), builds the seed, and emits
  a `provider_switched` boundary divider. Because the handoff never touches the
  provider being LEFT, switching away from one that is out of credits or rate
  limited works. A seed failure surfaces as a session error; the staged handoff
  clears only on `provider_switched`, so a failed switch retries on the next send.

## Where a provider connect executes

Credentials are **workspace-central** (connect-once): a captured credential lands
on the personal workspace and every agent runtime is served from it
(`/sandbox/credential`). The OAuth dance still needs a runtime, so the web
adapter's `providerEngine()` routes the connect surface by the persisted
`houston.pref.last_agent_id`:

- pref names an agent → that agent's runtime (`/agents/:id/auth/...`);
- pref absent → the host's hidden **setup runtime**
  (`/setup-runtime/auth/...`, `packages/host/src/routes/setup-runtime.ts`) — the
  pre-agent first-run path.

**Invariant: the pref never names an agent the control plane doesn't have.** The
adapter prunes it in cp `listAgents` (boot runs that before any connect surface
mounts) and clears it in cp `deleteAgent`
(`packages/web/tests/stale-agent-pref.test.ts`). A stale pref used to send
first-run logins to `/agents/<dead>/auth/:pid/login` → 404.

## `useProviderConnections` — THE way to build connect UI

`app/src/hooks/use-provider-connections.ts` (+ `app/src/hooks/provider-connections/`)
is the single shared layer for connect / cancel / sign-out. Any surface that
connects or disconnects a provider drives this hook — never re-implement status
probing, the OAuth event relay, or the connect actions. It owns tri-state provider
status, the pending/busy map, and the dialog state;
`ProviderConnectionDialogs`
(`app/src/components/provider-browser/provider-connection-dialogs.tsx`) renders the
dialog stack once from `connections.dialogProps`. Desktop drops `ProviderLoginUrl`
dialogs (co-located browser callback) — connect/re-auth event contract in
[auth.md](auth.md).

## Related

- Connect surfaces, model browsing, per-account usage → [ai-hub.md](ai-hub.md)
- Failure taxonomy the providers map to → [provider-errors.md](provider-errors.md)
- Anthropic credential lifecycle → [anthropic-credentials.md](anthropic-credentials.md)
- Local endpoints (Ollama / LM Studio / vLLM) → [local-models.md](local-models.md)
