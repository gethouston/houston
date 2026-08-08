# Per-user AI accounts + the per-agent model ceiling

In a team space there is **no shared AI credential**. Every turn runs on the AI account
of the person who sent it, and the manager sets a per-agent **ceiling** of which models
that agent may run on. Roles and the surfaces that gate them → `teams.md`.

## Per-user accounts (HOU-976)

- The gateway resolves the ACTING member's own credential row and stops there. A miss
  is an honest `404 personal_not_connected` → the provider not-connected card, and the
  member connects their own account in the AI Models hub.
- That is the entire remedy, so it must be self-serve: **no fallback account, no
  per-agent choice of account, no one-turn override, and no role that can connect an
  account on somebody else's behalf.** This is why `canSeeAiModelsPage` is
  unconditionally true — a gate can only be justified by an authority someone has, and
  nobody has authority over anybody else's AI account.
- **Storage is per `(org, user, provider)`**, not `(user, provider)`: connecting in a
  team space is consent for THAT team's agents only, and leaving a team takes the
  credential with the membership. A user in three team spaces connects three times.
- **The discriminator is ALWAYS server-side.** A request resolves a per-user credential
  when it carries an acting identity AND its org is a team space — two facts only the
  gateway holds. Not a query param, not a body field, not a signed claim the client may
  assert. **The client sends no scope anywhere**: no `?scope=` on any credential or
  auth route, no `credentialScope` on a send body, no scope argument on any credential
  function. Two tests hold the line —
  `packages/web/tests/credential-write-urls.test.ts` asserts each credential/auth URL
  WHOLE (byte identity, so a scope re-entering as a query param, a path segment or a
  second query fails whichever form it takes), and `app/tests/credential-scope-ui.test.ts`
  asserts no credential surface passes a scope or names another account.
- **Absence is the old world.** With NO acting identity — desktop, self-host, a personal
  space, the setup runtime, a fired routine — every path addresses the single workspace
  credential byte for byte as before. That is the `"team"` scope key (`TEAM_SCOPE_KEY`
  in `packages/host/src/credentials/scope-key.ts`, `TEAM_CREDENTIAL_SCOPE` in
  `packages/runtime/src/session/acting-context.ts`): one name for "the one shared row",
  not a second account a team space can reach. `setup-runtime` credential writes stay
  owner/admin for the unrelated reason that they provision a Deployment + PVC.

### Isolation is the implementation

- Only a gateway-SIGNED acting-as token can select a member's own credentials
  (`credentialScopeKeyFor`). A routine's bare creator sub deliberately cannot, and a
  token whose payload can't be decoded gets its own digest-named scope rather than
  falling back to the shared row — a garbled token must never READ the workspace
  credential.
- Both sides of the host↔runtime seam derive the key the same way, on purpose, or one
  member would read a different row per adapter.
- Downstream of the key: the runtime's credential store resolves the scope on every
  `read()` pi makes inside `prepareRequest` (`auth/credential-store.ts`, per-scope
  `auth.json` under `<dataDir>/auth-users/`); login and serve-sync are scoped the same
  way; the served-scope record and credential-health marks are keyed per
  `(scope, provider)`; `report-revoked` echoes the scope it observed and forwards the
  acting token; the host's remote-store cache is per scope; and the whole `auth-users/`
  subtree is denied to the agent's file tools (`session/tools/fs-guard.ts`) and dropped
  unconditionally from store-sync.
- The Anthropic-specific guards (the pod-shared `claude-login` write refusal, the
  `CLAUDE_SECURESTORAGE_CONFIG_DIR` relocation that closes mid-turn 401 recovery, the
  cached-status guard) are `anthropic-credentials.md` traps #4 and #6 — read those
  before touching any of it.

### Attribution is read-only

Two optional wire fields name WHOSE account answered, and nothing else:
`ProviderError.credential.scope` on a failed turn
(`packages/protocol/src/provider-error.ts`) and `credentialScope` on a `GET /providers`
row (`ProviderInfo`). Both come from the runtime's per-identity serve record
(`packages/runtime/src/auth/served-scope.ts`).

- They exist so a surface can say a TRUE sentence ("your Anthropic account is rate
  limited" rather than a generic one) and unlock no action, because there is no other
  account to offer.
- `"personal"` = the acting member's own account, the only one a TEAM space has;
  `"team"` = the single workspace-level credential of a personal space / desktop /
  self-host. Both fields are omitted without an acting identity, so treat absence as
  "one credential, nothing to disambiguate".

### Client surface

- **The hub is one list, labelled once.** In a team space `ai-hub-view.tsx` renders a
  "Your accounts" heading + description above the catalog (`aiHub:accounts.title` /
  `accounts.description`). Saying it once, above the rows, is what keeps a member from
  reading them as the team's shared connections. A personal space renders no note at
  all and looks exactly as it shipped. No account sections, no per-section status, no
  scope on any connect the hub performs.
- **Reconnect is unscoped** (`tauriProvider.launchLogin(provider)`), on the
  unauthenticated card and the in-chat reconnect card alike — the account that failed is
  the caller's own by construction.
- **Failure copy names the account** where it changes the meaning: `ModelUnavailableCard`
  reads `credentialScopeOf(error.credential) === "personal"`
  (`app/src/lib/credential-scope.ts`) and switches to
  `shell:providerError.credential.modelUnavailableBody`, so a member learns it is THEIR
  plan that lacks the model. No card gains an action from `credential`.
- **Model picker**: a `GET /providers` row's `credentialScope` becomes the row subtitle
  via `statusCredentialScope` + `pickerAccountLabel` (`chat:modelSelector.picker.account.*`).
  Absent ⇒ today's subtitle, unchanged. There is deliberately NO client-side per-plan
  entitlement filtering beyond `configured`: a personal plan that lacks a model fails
  the turn honestly as `ModelUnavailable`.
- Both readers live in `app/src/lib/credential-scope.ts`, unit-tested without a renderer
  (`app/tests/credential-scope.test.ts`). Two named readers rather than one generic
  reader because every field of the shape is optional — a `ProviderStatus` passed to
  `credentialScopeOf` would type-check and answer `null` forever.

### A team space with no credential explains itself

When statuses settle with nothing connected, the chat model picker's level 1 shows an
honest empty state instead of a blank panel.

- `pickerEmptyState` (`app/src/components/chat-model-selector-labels.ts`, copy under
  `chat:modelSelector.picker.noProviders.*`) has exactly TWO variants, `personal` /
  `team`. The copy depends only on which KIND of space this is: every viewer of a team
  space has the same story, since each connects their own account and nobody can connect
  it for them. There is deliberately no role-shaped variant — "ask a team owner or admin"
  would be a dead end.
- The ACTION stays gated on capabilities having LOADED (`canConnect`); the surface must
  not promise a Connect before it knows the deployment describes a hub.
  `use-picker-view-models` folds the same signal into `catalogState` so the picker holds
  a neutral loading state through that window. A capabilities load that FAILS is not
  "still loading": it settles on the permissive single-player default.

## The per-agent model ceiling

The manager sets which models the agent may run on; each member picks their own model
WITHIN it. There is no org-wide model ceiling — policy is per agent only, and a new
agent defaults to every model.

- **Ceiling shape** — `agent_settings.allowedModels: string[] | null` of provider-native
  model ids (`null` = all allowed; a set = restricted; treat `[]` defensively). Written
  via `setAgentSettings({allowedModels})` (`useSetAgentAllowedModels`,
  `hooks/queries/use-agent-settings.ts`).
- **One frontend home** — the shared presentational `ModelsAllowlistEditor`
  (`app/src/components/ai-hub/models-allowlist-editor.tsx`, the model-side twin of
  `AllowlistEditor`): an always-visible `AccessChoice` over the AI-hub catalog's
  `ModelAllowRow`s, `readOnly` hides the "Add models" list, all copy passed in.
- **Where it renders** — the agent settings page's **AI models** section (Permissions
  group), `agent-admin-model.tsx` → `AgentModelsSection`, through both of the page's
  doors (`permissions/agent-detail.tsx` is the shared mount). Manager-only; `readOnly`
  honoured. It answers WHICH models only — there is no per-agent choice of WHOSE
  account. The row lives in the multiplayer-only Permissions group, so single-player
  never shows it (the sole user picks a model in the composer).
- **The editor reuses the AI-hub model catalog** (`useHubCatalog()`, so it and the hub
  never drift) and its visual language: one row per `CatalogModel` (`BrandMark` +
  friendly name + muted lab name + allow `Switch`), the two-option `AccessChoice` ("Any
  model" saves `null`, "Only models you pick" saves an explicit set), an Allowed / Add
  split, and a search box backed by `searchModels()`.
- **One visible row maps to SEVERAL offer ids** — a `CatalogModel` is deduped across
  providers. The pure, unit-tested `app/src/components/agent/agent-admin/model-allowlist.ts`
  (`modelChecked` / `toggleModel` / `allowedModelCount`) keeps the id set in sync: a model
  is checked when ANY of its offer ids is present, toggling adds/removes ALL of that
  model's offer ids at once, unknown/stale ids and other models' ids are left untouched,
  writes stay de-duplicated and sorted. The wire format is unchanged.
- Sidebar ceiling text and the `{{count}} models only` copy count **models**
  (`allowedModelCount` over the hub catalog, plus unknown ids), not raw ids — falling
  back to the raw id count only while the catalog is loading.
- Copy under `teams:agentAdmin.models.*` (+ `agentAdmin.models.readOnlyNote`).

## Per-user model choice, and where a pick lands

- **Model scope is per MISSION (HOU-1064).** A pick made with a mission open writes that
  mission's activity pin (the same activity-pin path as single-player, provider-switch
  consent included) and moves only that conversation. A pick in a FRESH composer writes
  the caller's personal per-agent choice (`useAgentModelChoice` / `useSetAgentModelChoice`,
  `hooks/queries/use-agent-model-choice.ts`, optimistic cache update) — the default the
  user's NEXT missions start on. A member never writes the shared agent config.
- The picker displays the open mission's in-ceiling pin first, else the personal choice.
  An out-of-ceiling personal pick toasts `chat:errors.modelNotAllowed` instead of
  silently no-oping.
- **Pickers are NOT hidden or locked for members.** The composer shows
  `chat-model-selector.tsx` / `chat-effort-selector.tsx` to everyone and clamps the
  option list to `allowedModels`. A single-model ceiling renders read-only but still
  visible. Single-player / self-host is unchanged: shared config, no ceiling.
- **The picker no longer hides blocked models silently**: when the ceiling narrows the
  universe it renders a non-interactive footer "N more models are turned off in your
  workspace" (`chat:modelSelector.picker.hiddenByWorkspace_one/_other`), fed by
  `hiddenModelCount`. ui/core's `ModelPicker` grew a props-only, i18n-agnostic
  `footer?: ReactNode` that renders after ConnectMore inside its CommandList.
- **Pure decision + clamp + resting-pin helpers** live in
  `app/src/lib/model-selector-lock.ts`: `modelSelectorDecision`, `isModelAllowed`,
  `resolvePersonalModelPin` (mission pin wins in-ceiling; the ceiling snap resolves the
  model's OWNING provider via an injected catalog lookup) and `hiddenModelCount` (the
  count of DISTINCT blocked models across provider rows). The composer wires them in
  `use-agent-chat-panel.tsx`, revalidating the displayed effort against the pinned model
  (`validEffortOrDefault`).
- **Enforcement is the gateway's.** An in-ceiling per-conversation body pin is honored
  verbatim (casing normalized to the ceiling's, provider backfilled from the stored
  choice when the wire omits it); a pin-less or out-of-ceiling turn falls back to the
  acting user's choice ∩ ceiling, else first-of-ceiling. A client can never run a model
  outside the ceiling (`cloud/internal/edge/agents/model.go`, contract `C7-teams.md`).

## Types + client methods

- `AgentSettings.allowedModels` (the agent's whole model ceiling), `AgentModelChoice`
  (`{provider, model, effort?}`), `AgentModelChoiceInfo` (`{choice, allowedModels}`) —
  `ui/engine-client/src/types.ts`.
- `getAgentModelChoice` (404-degrades to `null` off-Teams) / `setAgentModelChoice`
  (`GET`/`PUT /agents/:slug/model-choice`); `setAgentSettings` widened to
  `{allowedToolkits?, allowedModels?}`.
