# AI Hub ("AI models")

The top-level view where a user connects AI accounts and browses providers +
models. It replaced the old Settings → AI provider section and the old Usage
screen. Provider/model *wiring* (catalog, picker, effort, switching) is
[providers.md](providers.md).

- Sidebar label **"AI models"**, `viewMode "ai-hub"` (`AI_HUB_VIEW_ID`,
  `app/src/lib/top-level-views.ts`). Entry:
  `app/src/components/ai-hub/ai-hub-view.tsx`, rendered by `workspace-shell.tsx`
  like any other top-level view. i18n namespace `aiHub`
  (`app/src/locales/{en,es,pt}/ai-hub.json`).
- **Settings no longer manages providers.** Deleted: `provider-settings.tsx`,
  `settings/sections/provider.tsx`, `shell/provider-account-row.tsx`, and the
  settings-view provider section. All connect UI is the hub.

## Layout

Laid out by the shared **`CatalogShell`** (`ui/core/src/components/catalog-shell.tsx`
— the same two-section grammar as the Integrations page):

- ONE top page search field (`ai-hub-view.tsx` owns `query`,
  `search.placeholder`) that narrows the Connected strip AND both tabs at once.
- **Connected** section — an `lg` header + `CatalogCount` chip (shown count while
  filtering, total at rest) over provider rows rendered OUTSIDE the tabs by
  `connected-providers-strip.tsx`. Omitted entirely when the query matches no
  connected provider.
- **Available** section header over the **Providers** / **Models** tabs, each with
  a `CatalogCount` chip.
- ONE scroll region (the old fixed-masthead split is gone). While a modal is open
  the scroller flips to `overflow-y-hidden` (Radix only locks `<body>`) with
  `scrollbar-gutter: stable` holding the offset.
- Navigation = `CatalogShell`'s controlled tab state + two local modal states in
  `AiHubView` (`openProvider` / `openModel`; last value retained through the exit
  animation). Modal stack: `hub-modal-stack.tsx`.

## Four surfaces

- **Providers tab** (`providers-pane.tsx`) — CONTROLLED by the page query (owns no
  search). Its controls row is the two Subscription / Pay-as-you-go billing toggle
  buttons (single-select; click the active one to clear) over a two-column grid of
  flat `CatalogRow`s (brand mark, name, live model count · cost prose). The row
  BODY opens the provider modal; the ghost `+` (`CatalogAddButton`) connects
  directly, flipping to a Cancel pill while that provider's OAuth is in flight.
  Only NOT-connected providers browse here.
  - The filter is driven by **billing**, not auth: `providerBilling()`
    (`components/provider-browser/provider-grouping.ts`) defaults from `auth`
    (oauth → subscription, apiKey → payg) and `PROVIDER_OVERRIDES[id].billing`
    overrides where they diverge (OpenCode Go is a flat $10/month subscription
    unlocked with a pasted key). The merged OpenCode connect card spans both
    billing kinds and matches whichever filter is active.
- **Provider detail** (`provider-modal.tsx` + `provider-modal-connect-button.tsx`
  / `provider-modal-footer.tsx`) — connect / sign-out plus that provider's model
  list (the same `ModelsBrowser`, passed no `query`, so it keeps its own local
  pill search).
- **Model directory** (`model-directory.tsx` → `models-browser.tsx` /
  `model-card-row.tsx`) — the cross-provider catalog as flat `CatalogRow`s
  (BrandMark + name + lab; whole row opens the modal, no trailing cue and no `+`
  — models install through a provider offer inside the modal) in the responsive
  two-column `CatalogGrid` (`layout="grid"`; the provider modal passes the default
  `"list"` because the grid's `lg:` breakpoint is viewport-based and would cramp
  the dialog). Above a control row of four facet comboboxes: AI provider
  (self-hides at one lab), Good at, Cost, Memory (`model-facets.tsx`). Free-text
  search is the hub's ONE page field, threaded in as `query`.
  - Comboboxes are the shared `components/shell/filter-combobox.tsx` (Popover +
    cmdk, optional in-dropdown search), also reused by the teams allowed-models
    editor (`components/agent/agent-admin/lab-filter.tsx`) and the Integrations
    page.
  - Cost/Memory buckets are the pure `costBucket` / `memoryBucket` in
    `ai-hub/facets.ts` (cost reuses the `costTier` thresholds plus a `$0` "Free"
    bucket; memory splits at 200K / 1M). Search: `lib/ai-hub/search.ts`.
- **Model detail** (`model-modal.tsx` + `model-offer-row.tsx`) — one model's
  per-provider offers ("Get it through" + pricing / subscription).

The old Mercury ledger (`models-ledger.tsx` / `model-row.tsx` / `LedgerHeader` /
`DirectoryFilters`) and the `ProviderBrowser` card grid are gone from the hub.
`ProviderBrowser` (`components/provider-browser/`) survives as the connect surface
for **onboarding**, the migration reconnect screen, and workspace setup (they pass
`onSelect`/`selectOnMount`). Onboarding alone also passes `curated`, swapping the
Connected/Available grouping for a featured-only Subscription/API-key split
(`CuratedProviderSections`) behind a "see all providers" expansion.

## The hub catalog

`loadHubCatalog(catalog, opts)` (`app/src/lib/ai-hub/catalog.ts`) builds the
directory at runtime from **two** sources; React entry `use-hub-catalog.ts`, types
`catalog-types.ts`, merge internals `catalog-merge.ts`.

1. **pi-ai's live `/v1/catalog`** — the AUTHORITATIVE base, mapped to merge
   candidates by `piCatalogToCandidates` (`catalog-pi.ts`). Every hub model exists
   because pi-ai can run it, with pi's own pricing/context/reasoning/vision.
2. **A checked-in models.dev snapshot** — `app/src/lib/ai-hub/model-catalog.json`,
   generated by `node scripts/generate-model-catalog.mjs` (set `MODELS_DEV_JSON`
   for an offline/pinned run) — folded in SECOND as optional enrichment
   (`foldEnrichment`): description / toolCall / imageGen / knowledge / releaseDate
   on a model that ALSO exists in pi-ai. A snapshot-only model is dropped, never
   added.

Every model gets a normalized cross-provider `key` (`normalizeKey`,
`catalog-key.ts`) so the same model across Anthropic / Bedrock / Copilot /
OpenCode / OpenRouter folds into one directory entry.

**The OAuth-curated vs gateway-full-list rule** (`piCatalogToCandidates`):

- **API-key gateways** (`opencode`, `openrouter`, `deepseek`, `google`,
  `amazon-bedrock`, `minimax`, and any provider with no Houston override) offer
  their **full** pi-ai model list.
- **Subscription / OAuth providers** (`openai`, `anthropic`, `github-copilot`) are
  filtered to **only their curated `PROVIDER_OVERRIDES[id].models`** ids, because
  the plan can only run that curated set. Without the filter the hub showed pi's
  full historical list (~24 for Anthropic, including `claude-3-opus`) instead of
  the ~4-model curated set. Asserted by `hub-catalog.test.ts` + `catalog-pi.test.ts`.

Which providers are visible at all: `getVisibleProviders` / `getConnectProviders`
(`app/src/lib/providers.ts`) — desktop + host `capabilities` gating, with the two
OpenCode gateways collapsed into one connect card. Directory counts only count
offers from that visible set. `useHubCatalog()` derives its view from the shared
`["provider-catalog"]` query rather than registering a second observer.

## Account usage on the Connected cards

**There is no Usage screen** (HOU-789) — an AI account and how much of it is left
are one thing, so each connected account's live limits render on its own card.

- `connected-provider-row.tsx` = `CatalogRow` + a plan chip at the trailing edge;
  `provider-usage-meters.tsx` spans the card's full width. Both ride `CatalogRow`
  slots (`ui/core/src/components/catalog-row.tsx`): **`below`** puts the meters
  inside the card's own hover/focus surface (one wash covers card + meters), and
  **`aside`** puts the plan chip OUTSIDE the row button so the button's accessible
  name stays "provider + how it is connected".
- **These are CARDS, not rows** — `CatalogRow surface="card"`: a 1px `line`
  hairline ring at rest, the hover wash as enhancement, `active:scale-[0.98]` press
  feedback. Consequences: **no trailing chevron** (only these cards dropped it —
  the Integrations installed strip, Skills rows and permissions agent rows keep
  theirs), and the **focus ring hoists to the card root** via
  `has-[:focus-visible]:` keyed on the button's own `:focus-visible` (never
  `:focus-within`, which flashes on every mouse press).
- Meters align to the CARD's own left padding (`px-3` both sides), not the text
  column. `ConnectedProvidersStrip` widens the `CatalogGrid` gap to 8px — at the
  catalog default of 4px two hairline cards read as one split card.
- Press motion transitions `background-color` + **`scale`** (not `transform`):
  Tailwind v4's `scale-*` sets the standalone `scale` property.
- **The whole card is one click target.** `CatalogRow` carries `onClick` on its
  OUTER element, so a click anywhere — meters included — opens the provider modal.
  The body stays a real `<button>` and the row's ONE focusable element; its
  keyboard activation dispatches a click that bubbles to the same handler. The
  right-edge `action` subtree is marked `data-catalog-row-action` and excluded, so
  the ghost `+` still only connects.
- **Strip preview cap is a strip-local 3**, not the shared
  `CATALOG_INSTALLED_PREVIEW_CAP` (6) — that constant was tuned for ~56px rows and
  these are ~130px.
- **In a team space the strip is the VIEWER's own accounts** (HOU-976): status and
  usage probes resolve against the acting member's credential, so two members see
  different Connected rows. There is no shared team account — full model in
  [ai-accounts.md](ai-accounts.md).

### The gate is confirmation, not mount

The strip is the hub's "yours" side, so its membership (`providerOwnedSide` =
connected ∪ checking, HOU-979) deliberately includes rows whose probe could not be
confirmed. `providerUsage()` throws rather than fabricate a reading, so
`connected-providers-strip.tsx` states the real precondition: it gates its ONE
fetch on `hasConfirmedAccount(...)` (≥1 CONFIRMED connection), and an unconfirmed
ROW renders no usage tier at all — no meters, and specifically not "No usage yet…",
a metering promise about an account Houston cannot read. Both decisions are pure
functions in `provider-usage-model.ts` (`hasConfirmedAccount`, `usageSlot`),
node-tested.

### Sizing: content, not reservation

A loaded row ends where its content ends (the tier's only trailing space is the
card's `pb-2.5`). Stillness comes from the data: ONE pre-data skeleton frame drawn
in the most common account's shape (two bars, matching `UsageWindowBar`'s metrics
to the pixel), and a failed or slow BACKGROUND refetch keeps the last good rows
(the error note only replaces meters when there is no data at all) — a poll can
never re-enter the skeleton. Sideways, the plan chip's slot is held open while the
reading loads. E2E regression: `packages/web/e2e/ai-hub.spec.ts` (the 2-window row
is byte-identical in height, the 1-window row ends flush).

### Data + poll

- `tauriProvider.usage()` → `useProviderUsage(enabled)`
  (`app/src/hooks/queries/use-provider-usage.ts`), key `providerUsage()`; wire type
  `ProviderUsage` in `packages/protocol`; host route `/sandbox/provider-usage`.
- **Poll is deliberately slow: `refetchInterval` 300_000 (5 min)** + refetch on
  window focus, `staleTime` 60s, invalidated on `ProviderLoginComplete`. Every poll
  fans out to each provider's own rate-limited usage API.
- **Additionally gated on the hub being the VISIBLE screen** (`isActiveTopLevelView`)
  — the hub is kept alive (HOU-813) and must not poll off screen.
- `tauriProvider.usage()` is `{ toast: false, capture: false }`: a background read
  whose failure the rows already state inline must not produce a red toast per
  interval and a Sentry event per attempt.
- The runtime reads each provider's OWN usage API with the linked credential
  (`packages/runtime/src/ai/usage/`): Anthropic's OAuth usage endpoint (5h / weekly
  / Opus windows; token resolved file → macOS Keychain → auth.json),
  ChatGPT/Codex rate-limit windows (classified by window LENGTH, not position),
  Copilot quota snapshots (enterprise domains target `api.<domain>`), OpenRouter
  credits, DeepSeek balance. Providers with no readable surface answer an honest
  `unsupported` row — never omitted, never a blank meter; a FAILED fetch says so on
  every row rather than letting each claim it is unmetered.
- Pure pairing/format logic (display-id rename + merged-gateway matching, reset
  phrasing via `Intl.RelativeTimeFormat`) in `ai-hub/provider-usage-model.ts`,
  node-tested in `app/tests/ai-hub-usage-model.test.ts`; fetcher mapping in
  `packages/runtime/src/ai/usage/usage.test.ts`. E2E: the fake host serves
  `/providers/usage` (default seed = the connected Claude subscription; armable via
  `POST /__test__/provider-usage`), asserted in `ai-hub.spec.ts` +
  `ai-models-ia.spec.ts`.

The old billing split ("AI subscriptions" / "AI per token") is gone — the strip is
one flat list and each row's cost line names how the account bills.

## Time worked (Settings > Time worked)

What remained of the old Usage screen after HOU-789 is hosted-cloud running-time
analytics, renamed **Time worked** (HOU-790 — no surface says "Usage" or "Compute
usage" to a user).

- Section id `"timeWorked"` (`app/src/lib/settings-sections.ts`); screen
  `app/src/components/time-worked/time-worked-view.tsx` (PageHeader + range tabs +
  `compute-section.tsx`) inside the shared `BackBarScreen`. Strings live under
  `aiHub:timeWorked.*`; data is `GET /v1/org/compute-usage` via `useComputeUsage`.
- Gate is `capabilities.computeUsage` (`showTimeWorked` in `useSurfaceGates`), NOT
  the hub's Teams gate — desktop/self-host get no Settings row and no screen.
- **Deliberate consequence:** the old Usage screen rode the owner/admin-only AI
  Models gate; Time worked rides `computeUsage`, so a plain member of a
  hosted-cloud team NEWLY gets this section. Safe because the gateway scopes
  `GET /v1/org/compute-usage` to the agents the caller can already reach. If that
  server-side scoping changes, this gate has to change with it.
- Analytics: `SettingsView` emits `tab_opened` `settings:timeWorked`; the old
  pane-level `usage:compute` / `usage:models` events are gone with the panes.

## Cross-surface inventory

`design/inventory` v2 added three content components (`ai-provider-card`,
`ai-model-row`, `ai-model-offer-row`) as web=`partial` — app-locked in
`components/ai-hub/`, extract to `ui/` before mobile.
