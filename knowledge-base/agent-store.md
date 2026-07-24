# Agent Store (public catalog: publish + install)

How a Houston agent becomes a public listing at `agents.gethouston.ai/a/<slug>` and
how anyone installs it back. **The store's data plane lives in the Go gateway
(`cloud/` repo), not this repo.** Houston owns three things: the AgentIR **contract
package** (`packages/agentstore-contract`), the **SSR frontend** (`agentstore/`,
which holds no DB and no credentials), and the **publisher/installer plumbing** in
the host + app. This sits one layer above Portable Agents
(`knowledge-base/portable-agents.md`): the same gathered content, pushed to a
hosted catalog instead of a file.

The authoritative wire/DB surface is the gateway's contract
`cloud/docs/contracts/C11-agent-store.md`; the cross-repo coupling is
`cloud/INTEGRATION.md` §Agent Store. This doc is the houston side.

## Where the pieces live

| Piece | Dir | Role |
|-------|-----|------|
| Contract | `packages/agentstore-contract` (`@houston/agentstore-contract`) | AgentIR 2.0.0 zod schema, normalize/backfill, secret scan, slugify, skill-frontmatter, JSON Schema. Pure zod, no DB/cloud libs. Workspace dep of `packages/domain` + `packages/host` (+ `app`/`packages/web` for `SLUG_REGEX`). Also exports the `./ir` subpath (node strip-types friendly). **The gateway's `internal/agentstore` is a Go port of it; this repo is the source of truth.** |
| HTTP client SDK | `packages/agentstore-client` (`@houston/agentstore-client`) | THE single isomorphic client for the gateway's `/v1/agentstore/*` REST surface: unified wire types (reconciled against the Go handlers), one `StoreApiError`, `AgentStoreClient` with anonymous (catalog/detail/categories/install ping/report) + authed (me/create/patch/delete/claim) + admin methods. No env reads — `baseUrl`/`fetchImpl`/`getToken` injected. Both frontends consume it; never hand-roll a store fetch again. |
| Store frontend | `agentstore/` | Next.js 15 App Router SSR catalog. **No database, no service credentials**; every read/write goes to the gateway `/v1/agentstore/*`. Sign-in is GCIP (Firebase Auth). Ships as a standalone container to GKE. **Space theme only**: `data-theme` is pinned dark (no toggle), body is transparent over the fixed Milky Way layers (`src/app/space.css` + `components/space-background.tsx`, static — no parallax, see the perf note there). Typography matches gethouston.ai (General Sans display via fontshare, system-stack body — no body webfont). `SiteHeader` is STORE-FIRST (mature-marketplace pattern): "Houston Agent Store" lockup → home, persistent catalog search, Explore/Publish/`UserMenu`, a "Download Houston" pill (the funnel back to gethouston.ai), transparent → dark on scroll, burger dropdown on mobile. Share cards: `app/opengraph-image.tsx` (default) + `app/a/[slug]/opengraph-image.tsx` (per-agent, via `lib/og-card.tsx`) render space-styled OG images with next/og. The website's top menus link here (`https://agents.gethouston.ai`). |
| Domain bridge | `packages/domain/src/store-ir.ts` | `irFromPortable` / `portableFromIr` between Houston portable content and AgentIR. |
| Host routes | `packages/host/src/routes/portable-store.ts`, `portable-store-ir.ts`, `store-publication-pointer.ts`, `portable-from-store.ts` | Credential-free: gather the IR + record a token-free local pointer; resolve an install link. |
| Engine seam | `ui/engine-client/src/client.ts` (front door), `packages/web/src/engine-adapter/portable.ts` + `portable-store.ts` (impl) + `store-gateway.ts` | `publishAgentToStore` / `updateStorePublication` / `unpublishFromStore` / `getStorePublication` / `importFromStoreLink`, plus the owner-dashboard methods `listMyStoreAgents` / `requestStorePublic` / `setStoreVisibilityUnlisted` / `unpublishStoreAgentById` / `deleteStoreAgentById`. Impl = `AgentStoreClient` over the `storeAuthFetch` seam (live bearer, one 401 refresh/replay). |
| Catalog reads | `ui/engine-client/src/store-catalog.ts` (re-exported by the adapter) | Anonymous CORS-open browse over the SDK: `fetchStoreCatalog` / `fetchStoreAgent` / `fetchStoreCategories` / `pingStoreInstall` / `reportStoreAgent`. No bearer, works signed-out; throws a status-carrying `StoreCatalogError` (deliberately not the engine error class). |
| App UI (publish/install) | `app/src/components/portable/` | Share wizard (`share-screen`, `listing-step`), `manage-publication` (incl. "See it in the store" + "manage all my agents"), `install-from-link`, `use-store-publication.ts`. |
| App UI (browse + manage) | `app/src/components/store-view/` | The in-app Agent Store page (sidebar + ⌘K destination, view id `agent-store`), two tabs: **Browse** (`store-browse` + `store-catalog-results`: gateway-driven category chips, integration filter, search, sort, detail modal with report dialog, one-click install) and **My agents** (`my-agents-panel` + `use-my-store-agents`: every published agent with request-public / make-unlisted / unpublish / delete / see-in-store). |
| Deep-link install | `app/src-tauri/src/store_deep_link.rs` (shell) + `app/src/lib/store-install-{deeplink,slug,drive}.ts` (shared frontend) | `houston://store/install?slug=<slug>` from the website → seeds the import wizard. See §One-click install below. |

The tie to `cloud/` is the gateway API + a shared Firebase project; the AgentIR
contract is a byte-copy relationship, not a runtime import.

## AgentIR 2.0.0 (the schema of record)

`packages/agentstore-contract/src/ir.ts`. The exported `AgentIR` type is
`z.infer<typeof agentIrSchema>`, so the schema is the sole source of truth. The
forgiving backfill lives in `normalize.ts`, never in the schema.

```text
irVersion:     "2.0.0"                       # literal; MINOR = additive optional, MAJOR = prepend an IR_MIGRATIONS step
identity:
  slug         ^[a-z0-9][a-z0-9-]{0,63}$      # derived from name via slugify at publish
  name         1..120
  tagline?     <=160
  description  1..20000
  icon?        { kind:"emoji", value } | { kind:"url", url (https, <=2048) }
  color?       <=32
  category     slug (one of the 14 category slugs, below)
  tags         slug[], <=6, default []
  creator      { displayName 1..80, url? (https) }
instructions:  <=200000                       # the agent's CLAUDE.md; may be ""
skills:        [{ slug, body }]  <=64          # body = the FULL SKILL.md text (frontmatter + markdown), verbatim
learnings:     [{ id, text<=4000, createdAt? }]  <=500
integrations:  string[] ^[A-Z0-9_]{1,64}$  <=64   # UPPERCASE Composio toolkit slugs
provenance:    { createdVia: "houston"|"agent-post", exporter?, houstonVersion?, anonymized? }
```

`superRefine` rejects duplicate skill slugs and duplicate learning ids.
`migrateAgentIr` lifts a stored raw IR to current before validating; v2.0.0 is the
floor (v1 never shipped), so `IR_MIGRATIONS` is empty and migrate is a validating
passthrough. Index exports: `agentIrSchema`, `normalizeAgentIr`, `migrateAgentIr`,
`agentIrJsonSchema` (Draft 2020-12), `parseSkillFrontmatter`, `slugify`,
`scanIrForSecrets`.

### JSON-Schema sync rule (houston is source of truth)

`agentIrJsonSchema` (`json-schema.ts`) is the source of truth for the public
schema. The gateway serves a **hand-maintained byte-copy** of its output at
`GET /v1/agentstore/schema/agent` (`cloud`'s `internal/agentstore/schema_agentir.json`).
A bounds/regex change updates `ir.ts` + `json-schema.ts` here AND `ir.go` +
`schema_agentir.json` in the gateway in the same change; both sides' schema tests
pin the invariants so they cannot silently diverge.

### The 14 category slugs

`writing`, `productivity`, `research`, `marketing`, `sales`, `coding`, `design`,
`data`, `education`, `finance`, `customer-support`, `personal`, `fun`, `other`. The
canonical list now lives in the gateway (`internal/agentstore/categories.go`) and
is served at `GET /v1/agentstore/categories`; the frontend and the publish wizard
render these with i18n labels. `identity.category` must be one of them.

## Ownership model: account-based, no manage tokens

Ownership is the caller's **Firebase UID** (`owner_user_id` on the gateway), proven
by their own GCIP bearer; there is **no per-agent manage token**. The old
manage-token model is gone (its vestigial `token.ts` module has been deleted from
`packages/agentstore-contract`).

Two publish identities:

- **Owned** (the normal Houston app path): `POST /v1/agentstore/agents { ir,
  publish: true }` with the user's bearer creates an agent owned by that UID.
- **Agent-native** (unattended, no Houston): a bare IR POST with NO bearer creates
  an UNCLAIMED agent and returns a one-time `claimCode` + `claimUrl`; a human later
  binds ownership via `POST /v1/agentstore/claim { agentId, code }`.

**State** (`draft` → `published` → `archived`) and **visibility** (`unlisted` vs
`public`) live on the gateway. A publish makes an agent `published` + `unlisted`;
going `public` is NOT self-serve; `requestPublic: true` only stamps a review flag,
dropping the agent into the admin queue. Install/report counters are trigger-owned;
no client writes them.

## In-app browse (the Store view)

The store is browsable INSIDE the app (`app/src/components/store-view/`,
view id `agent-store` in `TOP_LEVEL_VIEWS`): a sidebar + command-palette
destination rendering the public catalog in the shared catalog family
(`CatalogRow`/`CatalogGrid`/`CatalogDetailDialog`/`CatalogSearchField`).
Reads go straight to the gateway's anonymous CORS-open endpoints via
`ui/engine-client/src/store-catalog.ts` — no account, no engine round-trip;
base resolution mirrors the publish adapter (`__HOUSTON_STORE__` →
`VITE_AGENTSTORE_GATEWAY_URL` → prod).

The view is a two-tab shell (`store-view.tsx`): **Browse** stays mounted
(`forceMount` + hidden) so search/filter/scroll state survives tab switches and
`storeFocusSlug` deep links open the detail dialog from either tab; **My agents**
mounts lazily so its authed `GET /me/agents` query never fires until selected.
Two one-shot UI-store flags drive cross-navigation: `storeFocusSlug` (detail
dialog in Browse) and `storeOwnerTab` (deep-link into My agents, set by
`manage-publication`'s "manage all my agents").

Browse-side parity features: category-chip vocabulary comes from the gateway
(`fetchStoreCategories`, 24h staleTime; known slugs keep localized
`portable:publish.categories.*` labels, unknown slugs fall back to the gateway
name, fetch errors degrade to the static `STORE_CATEGORIES` seed);
an **integration filter** (`store-integration-filter.tsx`, ui/core `Select`)
whose vocabulary derives from unfiltered catalog pages, resolving names/logos
through the shared Composio toolkit catalog (`use-toolkit-catalog.ts` — never a
second brand map), passing the UPPERCASE slug as `?integration=`; and an abuse
**report dialog** (`store-report-dialog.tsx`, anonymous `reportStoreAgent`,
reason enum + details ≤2000 + optional contact ≤320, gateway rate-limited
5/min/IP). The **My agents** tab (`my-agents-panel` + `use-my-store-agents`)
manages ALL the account's store agents independent of any local pointer:
request-public, make-unlisted, unpublish + delete (both `ConfirmDialog`-gated),
see-in-store; every mutation invalidates `["store-my-agents"]` and surfaces
failure as a toast.

**One-click install** (`use-store-install.ts`) is the link-install path with
the paste skipped: `importFromStoreLink(slug)` fetches the preview through the
host (SSRF-guarded), parks it, and opens the import wizard seeded via the
one-shot `importSeedPreview` UI-store field — so the threat-scan choice,
naming, and content pickers are byte-for-byte the file/link flow. The
anonymous `installs` ping fires after, fire-and-forget (Sentry on failure,
never blocks). Category chips reuse the publish wizard's
`portable:publish.categories.*` labels via `storeCategoryLabelKey`; the view's
own strings live in the `store` namespace (en/es/pt).

Cross-links: the import wizard's upload step offers "browse the Agent Store"
(closes itself into the view), and `manage-publication` offers "See it in the
store" (sets the one-shot `storeFocusSlug`, which the view consumes into the
detail dialog — unlisted listings resolve by direct slug, so owners see their
own).

## Host routes + app plumbing

**The app owns the network.** Publishing is the APP's job: it POSTs the IR to the
gateway with the user's OWN bearer. The host is credential-free; it only gathers
the IR and records a token-free pointer. Agent-scoped routes dispatch through
`packages/host/src/routes/agents.ts` → `portable-store.ts`.

| Route | What the host does |
|-------|--------------------|
| `POST /agents/:agentId/portable/store-ir` | Gather portable content → `irFromPortable` (integrations = union of local grant toolkits + per-skill frontmatter; provenance `{createdVia:"houston", exporter:"houston-app", houstonVersion, anonymized}`) → `200 { ir }`. No network, no credentials. |
| `POST /agents/:agentId/portable/store-publication` | Write the token-free pointer `{ storeAgentId, slug, shareUrl, publishedAt }` → `200 { ok:true }`. Called AFTER a successful gateway publish. |
| `GET /agents/:agentId/portable/store-publication` | `200 { pointer }` (or `null`). |
| `DELETE /agents/:agentId/portable/store-publication` | Clear the pointer. |
| `POST /v1/portable/fetch-from-store` | Account-level (mounted in `server.ts`). Resolve a share link or bare slug → fetch `{apiBase}/v1/agentstore/agents/<slug>` (`config.agentStoreApiUrl` = `HOUSTON_AGENTSTORE_API_URL`, default `https://gateway.gethouston.ai`; SSRF-guarded, `redirect:"error"`, 30s) → unwrap `{ agent, ir }` → validate → `portableFromIr` → `200 { manifest, content }`. Failures surface real statuses (400/404/422/502). |

The gateway calls themselves are made by the engine-adapter
(`packages/web/src/engine-adapter/portable-store.ts`) through an
`AgentStoreClient` built per call: `baseUrl = storeApiBase(cfg)`, `fetchImpl =
storeAuthFetch` (the user's bearer, read live per attempt with a 401 → refresh →
replay, no `x-houston-org`). The store target differs by deployment
(`store-gateway.ts`): hosted/web reuse the engine `baseUrl` + live session token
(the engine IS the gateway); a desktop LOCAL sidecar gets
`window.__HOUSTON_STORE__` (public gateway URL + session token) installed by
`app/src/lib/store-gateway-session.ts` (`setStoreGatewaySession`).

### The publication pointer (machine-local, never exported)

`<agentRoot>/.houston/store-publication/store-publication.json` (key from
`storePublicationKey` in `packages/domain/src/layout.ts`). Shape:
`{ storeAgentId, slug, shareUrl, publishedAt }`. It carries **NO secrets**
(account-based ownership). It records which store agent this local agent maps to,
so the manage view looks up the live listing via `GET /v1/agentstore/me/agents` and
a re-publish reuses the SAME store agent instead of duplicating it. It is **not one
of the four portable export surfaces**, so it never rides out in a `.houstonagent`
export, and it survives an unpublish. A file that exists but doesn't parse THROWS
with the key named (beta policy: surface, never silently orphan the store agent).

## Publish flow (end to end)

1. App: agent menu → share wizard collects identity (name, description, tagline?,
   category, tags), creator, the portable selection/overrides, optional anonymize.
   Signed-out users get a sign-in CTA; a build with no auth hides the option.
2. `getEngine().publishAgentToStore(agentPath, req)` (adapter `portable.ts`):
   (a) host `POST .../portable/store-ir` → `{ ir }`; (b) if a pointer already
   exists, gateway `PATCH /v1/agentstore/agents/<id> { ir, publish:true }`, else
   gateway `POST /v1/agentstore/agents { ir, publish:true }` → `{ agentId, slug,
   shareUrl }`; (c) host `POST .../portable/store-publication` records the pointer.
3. App shows `share-screen`. `manage-publication` (backed by
   `use-store-publication.ts`) reads the pointer + `GET /v1/agentstore/me/agents`
   for live state, and offers update (`PATCH { ir, identity }`) and unpublish
   (`PATCH { unpublish:true }`; pointer kept for a duplicate-free re-publish). Every
   action surfaces its failure as a toast via `classifyStorePublishError`.
4. Going `public` is a separate `requestPublic:true` → admin review, not automatic.

## Install flow (end to end)

- **In-app (link back into Houston).** `install-from-link.tsx` →
  `importFromStoreLink(url)` → host `POST /v1/portable/fetch-from-store` resolves
  the link, validates the IR, maps it to portable content, and parks it in the SAME
  in-memory registry a file upload uses. It then flows through the existing import
  wizard (scan → name/color → per-item pickers → install), so the recipient always
  re-picks items regardless of what the publisher included.
- **One-click from the website (deep link).** See §One-click install below.
- **Claude Skill ZIP / copy-paste.** The gateway-fronted frontend serves the
  machine-readable artifacts (`agentstore/src/app/api/agents/[agent]/{ir,bundle,install-instructions}`);
  a `bundle` fetch records an anonymous install (counter via gateway trigger),
  framing fetched content as untrusted.

## One-click install (`houston://` deep link)

The website's "Open in Houston" (`agentstore/src/components/install-panel.tsx`,
pure URL builders + slug guard in `agentstore/src/lib/houston-launch.ts`) fires
`houston://store/install?slug=<slug>` via a hidden iframe, with a 1.5s
blur/visibility fallback revealing: Download Houston, **Open in Houston Web**
(`app.gethouston.ai/?install=<slug>`, base overridable via
`NEXT_PUBLIC_WEB_APP_URL`), and the copy-share-link path.

Delivery into the app:

- **Shell** (`app/src-tauri/src/store_deep_link.rs`, wired in `lib.rs`'s
  `on_open_url` beside the auth branch): prefix-guarded matcher
  (`is_store_install_deep_link`, rejects `installEVIL` lookalikes), emits the
  raw URL on the `store://deep-link` event AND (cold start only) stashes it in
  `PendingStoreDeepLinkState`, drained exactly once by the
  `take_pending_store_deep_link` command (the engine-handshake race pattern).
  Fully disjoint from `auth://deep-link`.
- **Frontend** (`app/src/lib/store-install-deeplink.ts` +
  `store-install-slug.ts` + `store-install-drive.ts`, mounted once in
  `App.tsx`): listens via the shimmed `legacyListen` (web no-op), drains the
  cold-start stash under Tauri, and on web reads `?install=` then
  `history.replaceState`-strips it. A `SLUG_REGEX`-validated slug parks in the
  non-persisted one-shot `pendingStoreInstallSlug`; a processing effect (gated
  on shell liveness + no open wizard, slug cleared before the await) runs the
  same seed flow as `use-store-install.ts`: `importFromStoreLink` →
  `setImportSeedPreview` → open wizard → fire-and-forget `pingStoreInstall`.
- **Security invariants**: slug validated on BOTH sides with the contract's
  `SLUG_REGEX`; the deep link only seeds the import wizard (threat scan +
  pickers unchanged) — **never auto-installs**; the website fires NO install
  ping for this path (the app pings once inside the seed flow).

## Creator profiles (@handles)

Influencer-grade identity, keyed to the same Firebase UID that owns listings.
Gateway is authoritative (`cloud` migration 021, `internal/agentstore/profiles.go`,
C11 §Creator profiles): handle (`^[a-z0-9][a-z0-9_]{1,29}$`, FCFS claim, 30-day
change throttle, reserved list byte-copied into
`packages/agentstore-contract/src/handle.ts` — `HANDLE_REGEX` /
`normalizeHandle` / `RESERVED_HANDLES`), display name, bio (≤500), 7 social
links, gateway-served immutable-cached avatar (multipart ≤2 MiB), admin-set
`verified`. Every catalog `AgentSummary.creator` is enriched with
`handle`/`avatarUrl`/`verified`, and a live profile's display name overrides the
listing snapshot, so profile edits propagate to old listings server-side.

Houston surfaces (SDK: profile/creator/analytics methods on
`AgentStoreClient`; authed front-door methods `getMyStoreProfile` /
`updateMyStoreProfile` / `checkStoreHandle` / `uploadStoreAvatar` /
`deleteStoreAvatar` / `getMyStoreAnalytics` implemented in
`packages/web/src/engine-adapter/portable-profile.ts`; anonymous
`fetchStoreCreator` / `reportStoreCreator` in `store-catalog.ts`):

- **In-app editor** `app/src/components/store-view/profile/` — dialog mounted
  app-wide from the user menu, opened via the `creatorEditorOpen` ui-store flag
  (user menu, My agents header, publish wizard). Handle picker with debounced
  availability, avatar pick → `app/src/lib/image-crop.ts` (pure canvas
  center-crop to 512px, no deps) → upload, socials, bio. Failure surfacing
  (HOU-864/865): every known gateway token maps to specific copy via the pure
  maps in `store-view/profile/save-error-map.ts` (handle tokens → field-level
  message; other save tokens + avatar tokens → specific toasts; unknowns fall
  back to a save-scoped or photo-scoped generic — never cross-labeled).
  `save-error.ts` holds only the engine-client token reader.
- **In-app creator pane** `store-view/creator/` — full-pane profile (agents
  grid, socials, `VerifiedBadge` from `@houston-ai/core` — inventory-tracked)
  opened via the `storeCreatorHandle` one-shot: from creator chips on rows and
  the detail dialog, from a leading-`@` search in the store search field, or
  from the `houston://store/creator?handle=<h>` deep link / web `?creator=`
  param (same `store://deep-link` rail as install).
- **Analytics** `store-view/analytics/` — owner-only installs-over-time (7/30/90d,
  gateway `GET /me/analytics` daily buckets, ComputeBarChart grammar) mounted in
  My agents.
- **Publish wizard** — with a claimed handle the creator step becomes a
  read-only "Publishing as @handle" row; free-text creator remains only as the
  profileless fallback.
- **Website** — `agents.gethouston.ai/@handle` (middleware rewrite →
  `/creators/[handle]`, per-creator OG card), `/me/profile` editor, `@` search,
  admin Creators tab (verify/release + creator reports).

## Admin + ops

- **Moderation lives in the gateway** (`/v1/agentstore/admin/*`, gated on
  `GW_STORE_ADMIN_UIDS`): the public-listing review queue, the reports feed, and
  the >30d drafts/soft-deleted purge. The frontend `agentstore/src/app/admin` page
  is the console; it calls those routes with the admin user's bearer.
- **Frontend image** `.github/workflows/agentstore-image.yml` builds + pushes the
  container to Artifact Registry on push to `main` touching `agentstore/**` or
  `packages/agentstore-contract/**`, then fires a `repository_dispatch` to
  `gethouston/cloud` (`roll-agentstore.yml`) which does the GKE roll. This repo
  never touches the cluster; that handoff is the trust boundary
  (mirrors `engine-pod-image.yml`).
- **Website bridge** `website/src/_redirects`: `/agent-store → agents.gethouston.ai`.

### Environment variables

| Var | Where | What |
|-----|-------|------|
| `AGENTSTORE_GATEWAY_URL` | store frontend (server) | Gateway base for public catalog reads (RSC). Default `https://gateway.gethouston.ai`. |
| `NEXT_PUBLIC_AGENTSTORE_GATEWAY_URL` | store frontend (browser) | Gateway base for client authed/anonymous writes (claim, publish, `/me`, admin, report). |
| `NEXT_PUBLIC_SITE_URL` | store build | Canonical public URL for OG + share/schema links. |
| `FIREBASE_API_KEY` / `AUTH_DOMAIN` / `PROJECT_ID` | store frontend | GCIP sign-in (SAME Firebase project as the gateway). In CI the image build reads the `FIREBASE_*` repo secrets shared with `release.yml`. |
| `VITE_AGENTSTORE_GATEWAY_URL` | app build | Store gateway target in desktop LOCAL-sidecar mode. Default `https://gateway.gethouston.ai`. |
| `VITE_AGENTSTORE_SITE_URL` | app build | Public store SITE base for "browse the store" links. Default `https://agents.gethouston.ai`. |
| `HOUSTON_AGENTSTORE_API_URL` | host | Gateway base for install-from-link IR fetch. Default `https://gateway.gethouston.ai`. |

## Local dev

```bash
pnpm install
cp agentstore/.env.example agentstore/.env.local          # point *_GATEWAY_URL at a gateway
pnpm --filter houston-agentstore dev                       # http://localhost:3300
# app publishes to the gateway with the user's own bearer; the host resolves
# install links. Point the app/host at the same gateway (dev or prod).
```

Full runbook in `agentstore/README.md`. With no gateway reachable, pages render but
catalog reads error (expected, not a bug).

## Starter agents (seeding the catalog under @houston)

Houston's own first-party listings come from the release-bundled starter agents in
`store/agents/` (the same packages the New Agent dialog installs from — see
`store/README.md`). `scripts/publish-starter-agents.mjs` is the official pipeline:
it reads each `store/agents/<id>/` package, builds its AgentIR, and publishes it to
the gateway under the **@houston** creator account. It is **idempotent by slug** —
a re-run PATCHes the existing listing instead of creating a duplicate, so it is
safe to run on every release. This is the seed path for the public catalog; ordinary
users publish through the in-app share wizard (§Publish flow), not this script.

## Gaps + follow-ups

- **Multi-file skills are lossy** (a skill is one `SKILL.md` body; sibling
  resource files are not carried).
- **Public listing is manual**: going `public` routes through the gateway admin
  review queue; there is no self-serve promotion.
- **No ratings/reviews** on either surface — a product decision, not debt.
