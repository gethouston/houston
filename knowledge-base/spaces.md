# Spaces (C8) — personal + team spaces, the switcher, invites, billing

Multi-membership: every user has one auto-bootstrapped **personal space** (free,
uncapped, non-invitable) and may belong to any number of **team spaces** (paid,
per seat). A Space **is** an org — same table, same roles; `kind` is
`"personal" | "team"`, derived server-side from `personal_of`.

Roles, per-agent access and the org dashboard → `teams.md`. Server contract:
`cloud/docs/contracts/C8-spaces-billing.md`. The gateway is the sole enforcer;
every client gate here is cosmetic.

- Feature-detect: `capabilities.spaces`, read only through `hasSpaces(caps)`
  (`app/src/lib/org-roles.ts`). Absent on desktop/self-host, where the switcher's
  create action stays "create a local workspace".
- **Personal space**: sharing never goes through it — every member-add / invite /
  billing route answers `403 personal_space`. To share, create or move into a team.
- **Team space**: `personal_of null`. Created self-serve; billed per seat once a
  second member accepts, which starts the 14-day no-card trial.
- Wire types in `ui/engine-client/src/types.ts`: `OrgSummary`, `OrgInviteSummary`,
  `OrgsList`, `BillingSummary`, `BillingCheckout`, `AgentMoveStart`,
  `AgentMoveStatus`, `Workspace.kind`. Client methods in `client.ts`: `listOrgs`,
  `createOrg`, `moveAgent`, `getMoveStatus`, `acceptOrgInvite`, `declineOrgInvite`,
  `getBilling`, `createCheckout`, `createPortal`, `setActiveOrg`.

## The switcher (`org:<slug>` workspace bridge)

- Spaces ride the EXISTING workspace switcher. `GET /v1/workspaces` returns one row
  per membership: the personal workspace (opaque id, never `org:`-prefixed,
  `kind: "personal"`, `isDefault`) plus one `{ id: "org:" + slug, kind: "org" }` per
  team, `slug` = `[a-f0-9]{16}`.
- **The adapter merges, it does not pass through.** `listWorkspaces`
  (`packages/web/src/engine-adapter/client/workspaces-mixin.ts`) fetches the bridge
  via `prefConfig()` and keeps ONLY the `org:*` rows, appended after a SYNTHETIC
  personal row — the synthetic `"default"` id is load-bearing for prefs/caches, and
  a local/self-host list stays byte-identical. A failed/absent bridge read degrades
  to personal-only.
- **Id grammar** — `app/src/lib/space-id.ts` (pure, unit-tested):
  `orgSlugFromWorkspaceId(id)` returns the 16-hex slug for an `org:*` id else `null`;
  `isTeamWorkspace(id)` is the boolean. The id alone drives everything, so a host
  returning no team rows needs no capability flag on this path.
- **Pinning the active space** — `setActiveOrg` (`app/src/lib/engine.ts` +
  `HoustonClient.setActiveOrg`): a team slug pins `x-houston-org: <slug>` on every
  gateway HTTP request and `?org=<slug>` on the two SSE routes (`/v1/events`,
  `/agents/:slug/events`), since browsers cannot set headers on `EventSource`.
  Personal (`null`) sends no header. Recorded on `window.__HOUSTON_ACTIVE_ORG__` and
  pushed into the live client in place; a fresh/repointed client re-applies it
  (`applyConfig`). The local host's header-free `/v1/ws` transport ignores it.
- **`GET /v1/catalog` deliberately sends NO `x-houston-org`** — the gateway's catalog
  handler ignores the request entirely (one global snapshot), so the header buys
  nothing and newly exposes a 403 from `ResolveOrg` on a stale slug, which pins the
  model picker at "Loading providers…" through `useProviderCatalog`'s `isSuccess` gate.
- **Restore last space** — `resolveActiveWorkspace` (`app/src/lib/workspace-switch.ts`):
  persisted `last_workspace_id`, else default, else first.

### Switch = scoped cache drop

`app/src/stores/workspaces.ts` `setCurrent` → `resetCacheForSpaceChange`
(`app/src/lib/space-cache.ts`).

- Tenant query keys are NOT org-scoped (the active space is only a request header),
  so team A and team B collide on one key. On a REAL space change `setActiveOrg`
  returns `true` and the store `removeQueries` with a predicate dropping every key
  EXCEPT the user-scoped, space-INVARIANT ones.
- `removeQueries`, never `invalidate`: invalidation leaves inactive-query data
  serving the prior space's rows on navigation — a cross-tenant flash.
- **Preserved:** `["session"]` and the durable onboarding flags
  (`["onboarding-pending"]`, `["onboarding-completed", uid]`). Purging them flaps the
  App.tsx auth/onboarding gates and re-blanks the shell mid-switch, and they are
  identical across spaces. Their roots are centralized in `app/src/lib/query-keys.ts`
  so the predicate references them without importing the hooks.
- Everything tenant-scoped refetches clean under the new space, including
  `capabilities` — **`caps.role` is the ACTIVE space's role**, so it must reload on
  every switch. The event stream re-establishes so the new `?org=` applies.
- A same-space reselect, and every switch on a personal-only host, is a no-op. First
  load pins the active space before the first fetches fire.

### The switch is in place — no splash

- `App.tsx`'s `WorkspaceLoading` splash is FIRST-BOOT only: a `bootedRef` latch flips
  once the full boot gate (agents/workspaces/capabilities/onboarding flags) clears,
  and the gate is `!booted && <condition>` thereafter.
- A switch re-flips capabilities + onboarding-flag loading and re-runs `loadAgents`,
  but the chrome is zustand-backed and every pane is skeleton-capable and
  capabilities-undefined-safe, so it transitions in place.
- The latch resets on an identity change: sign-out drops the session, the sign-in
  screen replaces the subtree, and the next identity remounts App with `booted` false.
- **Boot with NO space settles honestly.** If `loadWorkspaces` fails or yields no
  current workspace, `loadAgents` never runs; `useHoustonInit` calls the agent store's
  `settleEmpty()`, which settles the store AND calls `client.noteAgentsUnavailable()`.
  Without it every `loaded` gate hung — boot splash forever. The failure itself is
  surfaced by `lib/tauri.ts` `call()` (toast + Sentry) and recorded as the workspace
  store's `loadError` for the Settings retry.

### Per-space caches

- **Provider-connection snapshot** (`app/src/lib/provider-status-cache.ts`): the
  localStorage seed the query reset can't reach is keyed by active org slug
  (`houston.providerStatusCache.v2.<scope>`, personal ⇒ `"personal"`), so a switch
  reads the NEW space's snapshot or none (⇒ loading skeleton).
  `use-provider-statuses.ts` re-seeds and re-probes on a workspace-id change and
  gates the live probe on the new space's agents having loaded. A probe pins
  `activeProviderStatusScope()` when it STARTS and discards its result if the space
  changed mid-flight.
- Provider ROUTING is space-validated and refuses rather than guesses —
  `requireProviderAgentId(ctx)` over the adapter's three-state `agentList`
  (`packages/web/src/engine-adapter/client/provider-routing.ts`, `context.ts`).
  Documented with the rest of the provider plumbing.

### Live space list (no relaunch)

- `useSpacesLiveRefresh` (`app/src/hooks/use-spaces-live-refresh.ts`, mounted in App,
  gated on `caps.spaces`) re-lists workspaces on window focus + a 60s interval, so a
  team you were just added to appears without reopening the app.
- Merge decision is pure — `planSpacesRefresh` (`app/src/lib/workspace-refresh.ts`):
  unchanged ⇒ no-op; changed ⇒ swap the list keeping the selection; active space
  VANISHED (kicked) ⇒ fall back to default/first and re-pin + reset caches like a
  user switch.
- `refreshWorkspaces` never flips `loading` (no re-splash) and uses
  `tauriWorkspaces.listQuiet` (`surface:false` — a background poll must not toast per
  offline tick).
- Polling, not events: the gateway `/v1/events` hub is per-replica, so a membership
  event emitted on one replica misses subscribers on the other.

## Create-team

- The switcher's create action routes on `caps.spaces`
  (`app/src/components/shell/sidebar-chrome.tsx`): a Spaces host opens
  `create-team-dialog.tsx`; a non-spaces host keeps the local "create workspace".
- Validation `app/src/components/shell/create-team-model.ts` (`validateTeamName`,
  `MAX_TEAM_NAME_LENGTH`): trimmed, non-empty, ≤60 chars. The gateway re-validates.
- User-facing copy says **"Create organization"** (`teams:createTeam.*`); code
  identifiers keep the `createTeam` name.
- `useCreateTeam` (`app/src/hooks/queries/use-orgs.ts`) invalidates the spaces list
  and reloads the workspace store so the new team bridges in as an `org:*` workspace.
- `POST /v1/orgs` is NOT idempotent: a lost response is reconciled via `listOrgs`
  (`reconcileCreatedTeam`), never blind-retried.

## Delete-team (Settings → Danger Zone)

- **Route** — `DELETE /v1/orgs/:slug` (cross-org, like the rest of `/v1/orgs`; the
  gateway is the sole enforcer). `204` = the space and everything in it is gone.
  Rejections are FLAT `{error, code}`: `404 org_not_found` (unknown, or not the
  caller's), `403 personal_space` (a personal space goes with the account, never on
  its own), plain `403` (not the owner), `409 has_members` (teammates remain: remove
  them first), `409 subscription_active` (a live subscription: cancel it from Billing
  first). Conservative v1: only a solo owner with no live subscription can delete.
- **Feature-detect** — `capabilities.workspaceDelete` (gateway-injected, like
  `apiKeys` / `agentTeams`). The Danger Zone
  (`app/src/components/settings/sections/danger.tsx`) renders only when the flag is
  on AND the active space is a team (`isTeamWorkspace`) AND the caller owns it
  (`canDeleteWorkspace`, PRODUCT-1247). Desktop / self-host / a gateway that predates
  the route: no section at all — the one personal workspace was never deletable, and
  the old always-disabled "create another workspace first" row is gone with it.
- **Wire** — `deleteOrg` (`packages/web/src/engine-adapter/cp/spaces-billing.ts`),
  `deleteWorkspace(id)` on the workspaces mixin (`org:<slug>` → `deleteOrg`; the
  personal row and an off-cloud client THROW), app wrapper `tauriWorkspaces.delete`.
  **PRODUCT-1410:** the mixin used to be an empty stub, so the row left the local
  store while the space lived on and re-listed on the next refresh.
- **After the 204** — the workspace store's `delete` applies the same
  `planSpacesRefresh` merge as the live-spaces poll with the row removed
  (`stores/workspace-refresh-apply.ts`): the deleted space was active ⇒ `reselect`
  onto the default space, persist `last_workspace_id`, `setActiveOrg`, and reset the
  space-scoped caches; then the section reloads agents and `openHome()`s so the switch
  is visible. Error taxonomy `classifyWorkspaceDeleteError` /
  `isExpectedWorkspaceDeleteError` (`app/src/lib/workspace-delete-model.ts`); the
  expected codes are silenced from `call()` and toasted plainly
  (`settings:dangerZone.blocked.*`).
- Tests: `app/tests/workspace-delete-model.test.ts`,
  `packages/web/tests/workspace-delete.test.ts`.

## Invite inbox (the invitee side)

Auto-join fires only on an account's FIRST-EVER contact with the gateway, so for an
existing user a pending invite is inert until answered. The answer lives directly
under the workspace switcher, in the sidebar's `headerBelow` band
(`ui/layout/src/sidebar.tsx`).

- **Files** — `app/src/components/shell/pending-invites.tsx` + `invite-card.tsx`.
  `SidebarInviteInbox` owns the capability + query gate; `PendingInviteList` renders
  one always-visible `InviteCard` per invite (team name, the role you'd join as,
  Accept + Decline); the COLLAPSED rail shows `PendingInvitesRailButton`, a labelled
  count that expands the sidebar onto the cards.
- Never inside the switcher dropdown, never hover-gated: an invitation is the one
  thing here the user has not been told about.
- **Its own full-width row, not the header slot.** The expanded header shares its line
  with the collapse toggle (`flex items-center`), so a card inside `header` is inset by
  the toggle's column and drags the toggle to the middle of the stack. `AppSidebar`
  takes a separate `headerBelow` slot spanning the rail.
- **Bounded at a card boundary** — `max-h-72`: the header is a fixed non-scrolling
  region, so an unbounded list pushes the nav down and gets clipped by the rail's
  `overflow-hidden`. The bound shows two whole cards plus the top of a third; cutting
  through a card's Accept/Decline row reads as a rendering fault (macOS overlay
  scrollbars show nothing until you scroll). Team names carry `break-words` **and**
  `line-clamp-3` — the gateway allows 200 chars, possibly one unbroken token.
- **Spaces-gated on BOTH sides** — the fetch via `useOrgs(hasSpaces(caps))`, the RENDER
  via `visibleInvites(spacesEnabled, …)` (`invite-model.ts`). Gating only the fetch is
  a bug: disabling a React Query does not clear its cache. `hasSpaces(null)` is false
  while capabilities load, which is also the no-flash-on-boot rule.
- **Accept and Decline exclude each other** — `createInviteActionLock()`
  (`invite-model.ts`), one lock per list keyed by invite id, claimed SYNCHRONOUSLY
  before either mutation and released in a `finally`. `AsyncButton`'s rage-click guard
  is per BUTTON and `busy` only lands on the next commit, so Accept-then-Decline in one
  frame fired both and toasted `already_member` at a blameless user.
- **Who invited you is usually not shown, on purpose.** `OrgInviteSummary.invitedBy` is
  the inviter's USER ID and the invitee is not in that org yet, so no client read can
  resolve it. `inviterDisplayName` (`app/src/lib/invite-model.ts`) names the inviter
  only when the value is human-readable (an email, or a name with whitespace) and
  otherwise names the TEAM alone. A gateway that starts sending a display name needs no
  client change.
- **Hooks** — `useAcceptInvite` / `useDeclineInvite`
  (`app/src/hooks/queries/use-invites.ts`). Both invalidate `queryKeys.orgs()` on BOTH
  paths: `already_member` and `invite_not_found` mean the server's truth already moved
  on. The invalidation fires FIRST and is never awaited behind the workspace reload.
  Accept then awaits `loadWorkspaces()` — a joined team reaches the switcher through
  `GET /v1/workspaces`, a Zustand store no invalidation can reach. That reload swallows
  its own failure (records `loadError`), so the toast asks
  `teamIsInSwitcher(store.workspaces, org.slug)` first: confirmed ⇒ `joinedBody`
  ("switch to it from the space menu"), unconfirmed ⇒ `joinedBodyUnconfirmed`.
  **Nothing switches the active space** — joining is not going there.
- **Error taxonomy** — `classifyInviteError` / `isExpectedInviteError`
  (`invite-model.ts`): `403 needs_upgrade` (trial ended; the invite STAYS and becomes
  acceptable after an upgrade), `409 already_member`, `404 invite_not_found` (revoked,
  used, or addressed to another email — the gateway cannot tell them apart). Each is
  silenced from `call()`'s red bug toast and gets one plain informational toast
  (`teams:inviteInbox.errors.*`). `needs_upgrade` gets invitee-shaped copy, not the
  generic `degrade.writeBlocked*`.
- **Wire** — `acceptOrgInvite` / `declineOrgInvite`
  (`packages/web/src/engine-adapter/cp/spaces-billing.ts` + the mixin + the
  `ui/engine-client` shim), app wrappers `tauriOrg.acceptInvite` / `declineInvite`.
  Routes are the CROSS-org `POST /v1/org-invites/:id/accept` (`201 {org}`, unwrapped)
  and `DELETE /v1/org-invites/:id` (`204`) — NOT the org-scoped
  `DELETE /v1/org/invites/:id`, which is the owner's revoke (`deleteOrgInvite` /
  `useDeleteInvite`). Neither degrades: every rejection is a state the invitee must see.
- Tests: `app/tests/invite-model.test.ts`, `packages/web/tests/org-invites.test.ts`,
  `ui/engine-client/tests/client-teams.test.ts`, e2e
  `packages/web/e2e/team-invites.spec.ts` armed with `/__test__/space-invites`.

> **Gateway error bodies are FLAT `{error, code}`.** `shareErrorCode`
> (`app/src/lib/share-via-team.ts`) reads `body.code`; `HoustonEngineError.code` only
> understands the NESTED `{error:{code}}` shape. Every classifier that reads a gateway
> refusal goes through `shareErrorCode` for this reason (`agent-team-errors.ts` reuses
> it too).

## Share-via-team pipeline (order is law)

Sharing a PERSONAL agent has no members to assign, so the Share dialog opens this
sequential, resumable pipeline instead: `app/src/lib/share-via-team.ts` (pure state
machine), wiring `app/src/components/agent/share-via-team-flow.tsx`, hooks
`app/src/hooks/queries/use-spaces.ts`.

1. **pick / create** a team (owner/admin teams only, `ownableTeams`);
2. **confirm**, then **move** the agent (`POST /v1/agents/:slug/move` → `202 {moveId}`)
   and **poll** `getMoveStatus` to terminal `done` (poll route only, never the stream);
3. **switch** the active space to the team;
4. only then **invite** teammates (`addOrgMember`).

- The invite MUST NOT fire before the move is `done` and the space has switched —
  earlier it could start a trial on a team whose move then fails, or 403
  `personal_space` against the still-personal active space. `assertInviteReady` encodes
  the guard.
- Failures surface INLINE, never as a red bug toast (silenced via
  `isExpectedShareError`): `moveFailed` (`unsupported_move`, `unmovable_volume`,
  `needs_upgrade`, a poll `failed`, or a client-synthesized `timeout` at
  `MOVE_POLL_TIMEOUT_MS` ~5 min since `moving` is non-dismissable —
  `unmovable_volume` is terminal, the rest allow a bounded retry); `switchFailed` (the
  moved team isn't in the reloaded workspace list — retry the switch, never advance to
  invite); per-email invite failures tracked per `EmailInvite` row so a partial failure
  retries only its own rows.

## Billing surface

Team billing (C8 §Billing) surfaces in three places, all Spaces-gated and
team-space-only.

- **Billing section** (`app/src/components/organization/billing-tab.tsx`) — appended to
  the Admin section list when `canSeeBillingTab(caps, activeSpaceIsTeam)` holds
  (`orgTabIds` in `org-view-model.ts`; gate in `org-roles.ts` = Spaces host AND active
  team AND owner/admin). Shows derived status, seat count, and either checkout buttons
  (monthly/annual) or a "Manage billing" Stripe-portal button once subscribed
  (`billing-tab-model.ts` `billingAction`: `checkout` when unsubscribed, `portal` when
  `active`/`past_due` or an `interval` is set). Admins see it read-only with "ask the
  owner" copy. Data + actions via `use-billing.ts`
  (`useBilling`/`useCheckout`/`usePortal`; both open the returned Stripe URL in the OS
  browser).
- **Trial countdown pill + degrade banner** —
  `app/src/components/shell/team-status-banner.tsx`, decision
  `app/src/lib/team-status-model.ts` `teamStatusView`: one strip at the top of the
  active space. Owner/admin drive off the billing `status` — `trialing` renders the
  countdown pill (`daysLeftUntil`, rounded up, UTC-safe; a clock-less "Free trial"
  label when `trialEndsAt` isn't written yet), `expired` renders the degrade banner.
  Plain members have no billing data and drive off `OrgSummary.degraded` alone.
  `free`/`active`/`past_due` render nothing. Its Billing deep link is the ONE remaining
  consumer of `org-nav-store.ts`.
- **`needs_upgrade` write failures** — a `403` from a non-owner writing into an expired
  team is an expected business state. `isNeedsUpgradeError` (`team-status-model.ts`)
  routes it to a plain informational toast.
- **`personal_space` invite failures** — likewise expected. `isPersonalSpaceError` is
  routed in `tauri.ts` `surfaceError` to `teams:personalSpace.inviteBlocked*`. Defense
  in depth: the org-surface gate already hides the invite box in a personal space.
- **No push on expiry.** The effective status is a derived gateway read, so the client
  re-reads on entering a team space (the switch cache-drop refetches `billing` + `orgs`)
  and on window focus (`refetchOnWindowFocus`). Nothing is destroyed on expiry: reads
  keep working for everyone, the owner keeps full write access, one upgrade click
  restores members.

## Growth beats (all Spaces-gated)

- An onboarding "invite your team" finish card
  (`onboarding/missions/onboarding-flow.ts` `showsInviteTeamCard`).
- A space-switcher tour step.
- The personal-space person-filter teaser on the mission board
  (`app/src/components/mission-person-teaser.tsx`), which opens the create-team dialog.

E2E: `packages/web/e2e/spaces-gating.spec.ts` (fake host arms team rows via
`/__test__/workspaces`; switches spaces through the real UI).
