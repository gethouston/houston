# Agent Store site: design decisions

Covers `agentstore/`: the Next.js Agent Store site, its gateway facades, rendering, exports and listing pages.

## Server and client gateway facades

Server components and route handlers call the gateway's public catalog through `store-api.ts`, which reads the private `AGENTSTORE_GATEWAY_URL` per call (so `next build` succeeds without env) and sets explicit `next.revalidate` windows; it sends no credentials. Client components call through `store-client.ts` and `store-admin-client.ts`, which read the build-inlined `NEXT_PUBLIC_AGENTSTORE_GATEWAY_URL`, rely on the gateway's CORS grant, mint a fresh bearer per call, and force `cache: "no-store"` so authed calls are never served from the HTTP cache. After a mutation, callers re-read `listMyAgents` rather than trusting the PATCH response shape. Catalog params are normalized for the gateway (uppercase toolkit slug, default `recent` sort omitted). 404 reads return null for `notFound()`; any other failure throws so a gateway outage is a real error, never a silent miss. Sitemap enumeration is capped, omits creators with no public agent, and surfaces gateway failure rather than truncating. Wire types and the HTTP client live in `@houston/agentstore-client`. Lives in `agentstore/src/lib/store-api.ts`, `agentstore/src/lib/store-client.ts`, `agentstore/src/lib/store-admin-client.ts`, `agentstore/src/lib/store-api-types.ts`.

## Dynamic rendering and caching

Creator pages and the sitemap render dynamically so `next build` never calls the gateway; per-fetch revalidate (60s) still caches at runtime. The fetch cache is kept in memory only (an LRU capped at 50MB), because on disk Next never deletes entries and every distinct search URL becomes a file, which could fill the pod disk until eviction. The health route touches neither the gateway nor any database, so a gateway blip never restart-loops the web tier. Lives in `agentstore/next.config.ts`, `agentstore/src/app/creators/[handle]/page.tsx`, `agentstore/src/app/sitemap.ts`, `agentstore/src/app/api/health/route.ts`.

## Build output

The standalone output bundles `server.js` with minimal node_modules for the Docker image; the tracer root is the pnpm workspace root so workspace packages are traced and the entry lands at `agentstore/server.js`. Workspace UI and contract packages ship TypeScript source, so Next transpiles them. Lives in `agentstore/next.config.ts`.

## Response headers

Every response gets `X-Content-Type-Options: nosniff`, an origin-only cross-origin referrer policy, a no-framing header and a permissions policy denying unused features. These keys are disjoint from the wildcard CORS the public artifact routes set, so neither overrides the other. Lives in `agentstore/next.config.ts`.

## Read-only server and POST handling

The store server only reads: it defines no Server Actions, and route handlers export only GET and OPTIONS. Every write goes from the browser straight to the gateway. Next still routes a url-encoded or multipart POST to any page into its Server Action decoder, so the middleware rejects such requests on every path except hashed build assets. Lives in `agentstore/src/middleware.ts`.

## Vanity creator URLs

`/@handle` is rewritten (not redirected) to `/creators/[handle]` so the address bar keeps the short form. The pattern mirrors the gateway's handle grammar (`^[a-z0-9][a-z0-9_]{1,29}$`); anything else falls through. Default sort and page 1 are omitted from creator hrefs. The header search sends a leading valid `@handle` to the creator page and everything else to `/?q=`, working as a plain GET form without hydration. Old `/explore` and `/creators` routes survive as redirects so old links work. Lives in `agentstore/src/middleware.ts`, `agentstore/src/lib/creator-href.ts`, `agentstore/src/lib/search-routing.ts`, `agentstore/src/app/explore/page.tsx`, `agentstore/src/app/creators/page.tsx`.

## Public artifact routes

The IR, install-instructions and bundle routes are fetched by arbitrary assistants from any origin, so they set wildcard CORS: GET only, no credentials, already-public data only, separate from the gateway's own CORS. The IR route is a thin proxy because the store has no database and assistants need a stable bare-IR URL on the store origin (the gateway returns a wrapper); unlisted agents are served since the link is the access. The bundle route records an anonymous install best-effort (logged on failure, never failing the download) and forwards the client IP so the gateway's per-IP limit counts the real downloader. The client IP is the rightmost `X-Forwarded-For` hop, then `X-Real-IP`: the ingress (Traefik) appends the real IP on the right and earlier entries are client-supplied, matching the gateway's own rightmost-hop rule. Lives in `agentstore/src/app/api/agents/[agent]/`, `agentstore/src/lib/proxy-headers.ts`, `agentstore/src/lib/store-api.ts`.

## Exports

Every export runs a blocking scan of the IR's user-authored text for credentials before producing a payload; a finding aborts with `ExportSecretLeakError` so such a bundle never leaves the platform. Targets are exactly `claude-skill-zip` (default) and `copy-paste`. The ZIP puts each skill body verbatim at `<skill-slug>/SKILL.md` (the Claude.ai upload shape) and, when the agent has instructions, one composed `<agent-slug>/SKILL.md` with a two-key frontmatter; its folder is suffixed if a skill already owns the slug. Every entry, including the folder entries JSZip auto-creates with the current time, is pinned to a fixed date, because DOS times have 2-second granularity and unpinned folders made builds differ. The description is truncated at a word boundary to the Claude.ai skill description cap. YAML scalars are quoted only when a bare value would be ambiguous. The copy-paste block carries the definition inline behind a preamble framing everything below as data, not instructions; the install instructions point the receiving assistant at fetch URLs with the same framing. Lives in `agentstore/src/lib/export/` and `agentstore/src/lib/install/instructions.ts`.

## Launching into Houston

The website never installs an agent itself: the desktop deep link only seeds Houston's import wizard (scan, naming and pickers stay in the app), and the web fallback seeds the same import in Houston Web (`NEXT_PUBLIC_WEB_APP_URL` overrides the base for previews). Both builders validate the slug against the shared `SLUG_REGEX` and return null otherwise. The custom scheme is navigated through a hidden iframe so a missing app shows no "unknown protocol" page. The detail page waits a fixed time for the tab to lose focus or hide; if Houston opened, the "don't have it?" fallback never shows, and a repeat click supersedes the previous attempt. Lives in `agentstore/src/lib/houston-launch.ts` and `agentstore/src/components/install-panel.tsx`.

## Sign-in and sessions

The store signs in with the same Google Cloud Identity Platform project the gateway verifies, through a Google popup; one context owns the session and reads the ID token live through `getIdToken()` so long-idle tabs still send a valid bearer. Server components never see a token. When the `NEXT_PUBLIC_FIREBASE_*` config is missing, auth is off and the account control renders nothing, so unprovisioned previews show no dead button. A closed popup is a normal action and only re-enables the button. A non-throwing session hook serves optional chrome outside the provider. Lives in `agentstore/src/lib/auth/` and `agentstore/src/components/user-menu.tsx`.

## Owner and admin surfaces

The creator page is one page per creator: when the signed-in viewer is that creator, it swaps in place to the owner experience (the same `CreatorProfileScreen` in owner mode); a failed ownership probe is logged and leaves the public view, since `/me` surfaces the same failure on navigation. Admin access is decided by the gateway, which matches the caller's UID against `GW_STORE_ADMIN_UIDS` and answers 404 to everyone else, so the page renders for everyone and a non-admin sees an access notice; nothing sensitive is server-rendered. The admin handle grant allows reserved handles (how official handles are minted), checks only grammar client-side, and refreshes the lookup to the granted handle. Claim credentials ride the URL fragment (`#c=<code>&a=<agentId>`); a 409 on claim is fine when the agent is already the caller's; publishing is two PATCHes (identity, then `{publish:true}`) and the new slug is read back from `me/agents`. `/me`, `/me/profile`, `/admin`, `/claim` and the API are client-side or excluded from indexing in `robots.ts`. Lives in `agentstore/src/components/creator-profile-view.tsx`, `agentstore/src/app/admin/`, `agentstore/src/app/claim/`, `agentstore/src/app/robots.ts`.

## Reports

Report reasons must match the `report_reason` database enum. Error copy is keyed by the gateway's error code, falling back to the HTTP status (a rate-limit token without its own copy uses 429's). Report dialogs are always-visible ghost buttons and keyboard operable. Lives in `agentstore/src/components/report-dialog.tsx` and `agentstore/src/components/report-dialog-parts.tsx`.

## Markdown descriptions

Agent descriptions render through a small dependency-free Markdown renderer that emits React elements only, never `dangerouslySetInnerHTML`, so author text is escaped; links are limited to http(s) and open in a new tab with `rel="noopener noreferrer"`. Lives in `agentstore/src/components/markdown.tsx`.

## Styling and theme

The Tailwind bridge is imported from `@houston-ai/core`, never copied, because a stale copy mapped old token names. `@source` is resolved relative to the declaring file, so both the app's source and core's TypeScript components are registered explicitly. The body rule is unlayered like core's, since an `@layer base` copy would lose. The constant pre-paint theme script prevents a light/dark flash and contains no user content. The store follows `prefers-color-scheme`, so header foregrounds pair with surfaces by token (white text on the light gutter was invisible); secondary links use ink at 70% to clear 4.5:1 where `ink-muted` measures about 3:1. The site header is transparent at the top and near-opaque when scrolled, never blurred. Lives in `agentstore/src/app/globals.css`, `agentstore/src/app/layout.tsx`, `agentstore/src/components/site-header.tsx`.

## Share cards and site config

Share cards use next/og (Satori), so only its CSS subset applies and the space look is painted with gradients and star dots, never a network fetch; unknown slugs and handles fall back to the default card. `siteConfig.url` uses `||` and trims so an empty env value still yields a valid absolute URL for `metadataBase`. The brand name lives only in `site-config.ts`. Lives in `agentstore/src/lib/og-card.tsx` and `agentstore/src/lib/site-config.ts`.

## Small rules

The copy button falls back to a hidden textarea and `execCommand` and never throws. Creator links typed without a scheme get `https://` before the https-only validation. Install analytics roll per-agent UTC-day rows up to per-day totals. Lives in `agentstore/src/components/copy-button.tsx`, `agentstore/src/lib/agents/creator-url.ts`, `agentstore/src/lib/analytics-model.ts`.
