# iOS Parity Spec — Settings · AI Models · Integrations (hosted mode)

> Extracted from houston/ + cloud/ on 2026-07-05 (citations were file:line-verified at extraction).
> Companion to `mobile/PARITY.md`; same rules: en copy is authoritative (es/pt mirror keys),
> update via the client-architecture procedures when desktop changes.

## 0. Architecture facts that gate everything

- iOS data path: Swift → SDK bridge bundle → `@houston/sdk` → `@houston/runtime-client`. iOS does
  NOT use `ui/engine-client` (desktop/web front door).
- Per-agent URL scoping: `sdk.ts clientFor(agentId)` → `${baseUrl}/agents/<id>/…`; flat calls go to
  `${baseUrl}/…`. The injected fetch carries the Supabase JWT.
- **Provider credentials are per-agent-pod** in hosted mode (`/auth/*`, `/providers`, `/settings`
  are per-agent). There is NO global "connect Claude once".
- **Integrations are the opposite**: gateway-owned, user-scoped (`caller.sub`), shared across the
  user's agents; per-agent grants gate which agent may use each connected app.

## 1. Settings surface (desktop: SettingsView/SettingsIndex)

> **SUPERSEDED for iOS by PARITY-CHAT §7 (founder directive 2026-07-06):** the iOS Settings
> surface is pared to **Account + Appearance only**. The ✅ marks below describe the pre-cut
> port and stay as the reference for the desktop rows; every other row (workspace name,
> language, contexts, report bug, danger zone, version footer) is NOT shipped on iOS today.

Header "Settings" (`settings:title`); subtitle "Manage your workspace and account."
Rows/groups in desktop order (iOS ports all marked ✅):

| Element | Copy key | Behavior | iOS |
|---|---|---|---|
| Workspace name | `settings:workspace.title` | rename → engine; toast `settings:toasts.workspaceRenamed` | ✅ |
| Appearance | `settings:appearance.title` (+ `.light`/`.dark`) | DEVICE-LOCAL theme (no wire) | ✅ local |
| Language | `settings:nav.language` | en/es/pt; persists `PATCH /workspaces/:id/locale {locale}` + local change; toast `common:language.toastChanged` | ✅ |
| Account | `settings:account.title`; button `settings:account.signOut` "Sign out"; `.fallbackName` "Signed in" | avatar (`user_metadata.avatar_url`) + name (full_name→name→email) + email; Sign out = signOut(), NO confirm dialog | ✅ sign-out lives here |
| Members | `org:members.navLabel` + `settings:index.rows.members` | only when `canSeeMembers(capabilities)` | ⚠ org only |
| Group "Context" | `settings:index.groups.context` | | ✅ |
| Workspace context | `settings:nav.workspaceContext` (+ value "Set" `.values.set`) | drill-in editor | ✅ |
| Your context | `settings:nav.userContext` | drill-in editor | ✅ |
| Group "Support" | `settings:index.groups.support` | | ✅ |
| Report bug | `settings:nav.reportBug` "Report bug" / "Something broke? Tell us" (`settings:reportBug.*`) | message + recent logs | ✅ adapt log capture |
| Danger zone | `settings:dangerZone.*` ("Danger zone", "Delete workspace", confirm keys) | deleteWorkspace; blocked if last (`.createAnotherFirst`) | ✅ destructive |
| Version footer | `settings:version` "Version {{version}}" | tap copies; toasts `.versionCopied`/`.versionCopyFailed` | ✅ |

SKIP on iOS: Keyboard shortcuts; Connect phone / QR pairing (legacy tunnel, dead); updater;
local-engine rows.

## 2. AI Models (desktop: ai-hub view, header `ai-hub:hero.title` "AI Models")

Two tabs on desktop: Providers grid + "Models · N" directory.

### 2a. Provider catalog (two id namespaces!)
Frontend catalog: `app/src/lib/providers.ts` (UI ids, connect cards, logos; Codex = `openai`).
Host/wire catalog: `packages/host/src/providers.ts` (Codex = `openai-codex`).
Mapping: `capabilityIdsForProvider` (`app/src/lib/providers.ts:688`) — port to iOS.

| UI id | Name | Auth | cloud? | Logo component |
|---|---|---|---|---|
| openai (wire openai-codex) | OpenAI (Codex) | oauth device-code | ✅ | OpenAILogo |
| anthropic | Anthropic (Claude) | oauth device-code | ❌ ToS | ClaudeLogo |
| github-copilot | GitHub Copilot | oauth device-code (+Enterprise dialog) | ❌ | GitHubCopilotLogo |
| opencode + opencode-go (merged ONE card, `gatewayIds`) | OpenCode | apiKey | ✅ | OpenCodeLogo |
| openrouter | OpenRouter | apiKey | ❌ | OpenRouterLogo |
| deepseek | DeepSeek | apiKey | ❌ | DeepSeekLogo |
| google | Google Gemini | apiKey | ❌ | GeminiLogo |
| amazon-bedrock | Amazon Bedrock | apiKey | ❌ | AmazonBedrockLogo |
| minimax | MiniMax | apiKey | ❌ | MiniMaxLogo |
| openai-compatible | Local model | — | — | DESKTOP-ONLY, exclude |
| subq | SubQ | coming soon | — | "SQ" mark |

**LOGOS: no asset files — inline React SVG components in
`app/src/components/shell/provider-logos.tsx`** (24×24 viewBox, currentColor; OpenCode two-tone
240×300; OpenRouter/LocalModel/Bedrock stroked). Port the exact `<path d>` strings to SwiftUI.
Dispatcher `ProviderGlyph` switches on id (google/gemini → GeminiLogo), falls back to first initial.
Model lists per provider (id, label, effortLevels, contextWindow): `providers.ts:117-672` — port
verbatim where iOS shows a model picker. Effort vocab low/medium/high/xhigh/max, default medium,
model-clamped (`providers.ts:11-28,898-924`).

### 2b. Hosted connect flow (wire = runtime-client, all per-agent paths)
| Op | Wire |
|---|---|
| List | GET /providers → ProviderInfo[] {id,name,configured,isActive,activeModel,models[]} |
| Status | GET /auth/status → {providers: ProviderAuth[], activeProvider} |
| Start OAuth | POST /auth/:provider/login?deviceAuth=true[&enterpriseDomain=] → LoginInfo |
| Cancel | POST /auth/:provider/login/cancel |
| Complete (paste) | POST /auth/:provider/login/complete {code} — only `auth_code` kind |
| API key | POST /auth/:provider/api-key {key} |
| Logout | POST /auth/:provider/logout |
| Active model | PUT /settings {activeProvider?, model?, effort?} (use SDK resolveModelSettings semantics) |

`LoginInfo` union: `{kind:"url"}` (local only — not hosted) · `{kind:"auth_code", url, instructions?}`
(open url, paste code → complete) · `{kind:"device_code", verificationUri, userCode}` (show code,
open uri, poll GET /auth/status until configured flips). Hosted = deviceAuth=true default.
Copy: `providers:providerLogin.*` (deviceCodeLabel "One-time code", deviceCodeHint, deviceWaiting,
copyCode/codeCopied, deviceSettingsHint for OpenAI), `providers:apiKey.*` ("Connect {{name}}",
save "Connect", getKey "Get your API key"), `providers:signOutConfirm.*`, card states
`providers:card.*` ("Connected"/"Not connected"/"Connecting..."/"Coming soon"), toasts
`providers:toast.*`.

## 3. Integrations (Composio; KB houston/knowledge-base/integrations.md, contracts C1/C4)

Surfaces: global page (Connected apps grid + card→per-agent access sheet; always-visible
"Connect more apps" catalog: A-Z ~1000 apps, category dropdown, search, load-more) and a per-agent
tab (Apps this agent can use w/ deactivate toggles · Other apps connected (Activate=grant) ·
Connect more). Degraded mode when grants null: all connected usable, no toggles.

Wire (gateway, user JWT):
- GET /v1/integrations → readiness ({provider:"composio", ready})
- GET /v1/integrations/composio/toolkits → {items: {slug,name,description?,logoUrl?,categories?}}
- GET /v1/integrations/composio/connections (+/:id poll) → {toolkit, connectionId, status: active|pending|error}
- POST /v1/integrations/composio/connect {toolkit} → {redirectUrl, connectionId}: open URL (OAuth), poll until active
- POST /v1/integrations/composio/disconnect {toolkit}
- GET /v1/agents/:slug/integration-grants → {toolkits[]}; **404 → null → "unsupported, no toggles"; [] → nothing granted** (distinct!)
- PUT /v1/agents/:slug/integration-grants {toolkits} (replace-set, slugs [a-z0-9_-]+; 403 not_assigned)

503 when no COMPOSIO key on the gateway → show `integrations:unavailable` "Integrations are not
available in this setup." Sign-in state: `integrations:signin.*`. **Toolkit logos are REMOTE
`logoUrl`s (AsyncImage) — provider logos are inline SVG. Two rendering paths.**
Copy: `integrations.json` — title "Integrations", `.home.description`, `.status.*` (Connected /
Finishing up / Needs reconnecting), `.waiting.*`, disconnect confirms, `.agentTab.*`,
`.connectMore.title`, `.picker.*`, `.browse.*`, recovery keys.

## 4. SDK gaps (as of extraction)

- providers: wire exists on runtime-client; NO SDK module → build `providers` module (per-agent).
- integrations: absent from runtime-client (only ui/engine-client) → add user-scoped methods to
  runtime-client + SDK `integrations` module (keep 404→null and 503 semantics).
- preferences/locale: absent from runtime-client → add GET/PUT /preferences/:key +
  PATCH /workspaces/:id/locale + SDK module.

## 5. iOS IA (mirror desktop nav names/order)

Desktop sidebar order: Mission Control · Integrations ("Integrations", icon Blocks) · AI Models
("AI Models", icon Boxes) · Settings ("Settings", icon Settings). Per-agent tab set separately has
Integrations + Agent Settings. Mobile: Settings tab groups rows as desktop (top card → Context →
Support → Danger).

## 6. Hosted-mode landmines
1. Per-agent provider credentials — no user-level store; surface the scoping clearly.
2. OAuth in hosted = device-code only; poll /auth/status; no loopback; no paste-back except auth_code.
3. Provider availability varies by pod — read /providers at runtime, never hardcode (anthropic +
   most apiKey providers are cloud:false today).
4. Two provider-id namespaces (openai vs openai-codex; google/gemini) — carry the mapping.
5. Integrations user-scoped, grants per-agent; 404-null vs empty-array are different states.
6. 503 unconfigured must not crash the tab.
7. Toolkit logos remote, provider logos inline SVG.
8. openai-compatible is desktop-only.
9. Theme device-local; language engine-persisted.
10. Members rows conditional on capabilities.
