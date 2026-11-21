# Accounts, spaces and per-agent policy are gateway commands

Five SDK modules cover the person's own account and the spaces they work in: `account`, `org`, `teams`, `spaces` and `workspaces` under `packages/sdk/src/modules/`. They share one shape, and a maintainer adding a call to any of them should keep it.

## Shared shape

- **Plain commands, no reactive scope.** A settings or admin screen opens, reads once and writes from a form. No host event invalidates these reads and no surface renders them continuously, so none of these modules publishes a scope or subscribes to events. The same handlers back the typed facade and the `dispatch` path.
- **Their own HTTP seam, never `clientFor(agentId)`.** These are gateway or host control routes about the caller, the space or an agent, not calls into an agent's sandbox, and the runtime client serves none of them. Each module runs on its own `moduleScope` rooted at the base URL and calls `httpRequest` with literal paths. Literal paths are also what keep the routes visible to the assistant catalog generator.
- **Nothing degrades in the SDK.** Every non-2xx throws the module's error (`AccountHttpError`, `OrgHttpError`, `TeamsHttpError`, `SpacesHttpError`, `WorkspacesHttpError`) carrying the HTTP `status`, 404 included. A gateway that predates a route answers 404, and the surface decides whether that hides a section or is a failure. No surface gets a silent empty answer it did not ask for. A 401 also fires `onUnauthorized` into the shared `ModuleContext.authExpiry` notifier, so a lapsed token becomes a visible `tokenExpired` signal.
- **Command payloads are untrusted.** A dispatched envelope arrives serialized, so each module's readers validate the top level (`requireObject` in `teams/commands.ts`, `requireRole` and `optionalNumber` in `org/types.ts`, `requireContextKind` and `requireSidebarLayout` in `workspaces/types.ts`). An absent optional number stays absent, because a `0` would reach the gateway as a real bound. `ORG_ROLES` mirrors the protocol's `OrgRole` union at runtime, so a role added to the protocol must be added there too or the module refuses it.

## Account

`modules/account` holds the caller's display profile (`/v1/me/profile`) and personal API keys (`/v1/keys`).

- `EditableProfileUpdate` (`types.ts`) has three states per key: a string sets the override, `null` clears it back to the identity provider's value, and an omitted key leaves the field alone. A form that edits only the name sends only `displayName`; sending `photoUrl: null` with it would wipe the picture. `profileUpdate` therefore copies only the keys a payload carries and never defaults one to `null`. `EditableProfileCustom` says which fields are the person's own, which is what decides whether "Remove picture" or "Reset name" has anything to do.
- `ApiKeyCreated` carries the full secret (`hst_` plus 64 hex) once, in the mint response. A surface keeps it in local state for the one-time reveal and out of any query cache.
- `api-setup-prompt.ts` builds the prompt a person pastes into their own coding agent. It never carries a key: it names `HOUSTON_API_KEY` and tells the agent to ask for the key and never print, hardcode or commit it, because a copied prompt ends up in chat histories and repos. In `api-examples.ts`, `apiTryKeyRequest` embeds the freshly minted key on purpose, since it is shown once beside the key in the same card. `apiStartMissionRequest` reads `$HOUSTON_API_KEY` like the prompt does.

## Org administration and seats

`modules/org` covers the active space's roster, roles, invitations, audit and usage. The gateway resolves the space from the session plus the active-space header the `fetch` stamps, so nothing in the module names one.

- `seat-add.ts` returns seat refusals as `AddOrgMemberOutcome` values, not thrown errors: a declined card, a bank confirmation and a payer-only seat are all states the person acts on. A stale quote (`seat_quote_changed`, `seat_quote_expired`) is re-quoted here, so every surface shows the new price the same way. The add carries the quote's `prorationDate`, and an amount only ever travels with the date it was quoted at, so the charge is the one the person saw.
- `SEAT_CHARGE_IN_APP_HINT` is what the AI Manager says when an add needs a paid seat. The manager never pays for one; the person adds the member from People, where the price shows first.
- `seat-view.ts` is the one pure reading of a seat quote and the org's billing for the add and remove flows (`SeatAddStep`, `SeatNote`, `SeatChargeView`, `SeatAddedNote`, `SeatRemoveNote`, `seatAddBlocked`). Renewal bills the seats in use that day, and pending invites can push that past the paid seats. A yearly org gives no refund on removal: the seat stays paid until renewal and the next person added takes it free.
- `usage.ts` and `member-routines.ts` sit apart from `http.ts` because they read history and automations rather than membership.

## Per-agent policy

`modules/teams` holds what a manager sets on one shared agent: assignments, toolkit and model ceilings, the acting person's own model pick, and trigger health. A single-user host has nothing to resolve these against, so they are gateway-only.

- `setAgentAssignments` takes a full row per person with its access level. There is no id-only shorthand, because a shorthand would have to guess a level and would silently demote every manager it was handed.
- `PUT /v1/agents/{agent}/settings` reads then merges, so `setAgentSettings` sends only what changed and `null` means no limit (`AgentSettingsUpdate`). In `AgentSettings`, `allowedToolkits` is the whole effective allowlist (policy is per agent only). In `allowedModels`, a listed id is allowed on every provider, and a retired id also allows the model its catalog row `runsAs`, on that provider only. The gateway clamps each person's pick to that ceiling on every turn.
- `AgentEffortLevel` is a closed set of four. A value outside it is dropped on the way to the model rather than clamped, so an invented value silently gets the provider default.
- `triggerRemedy` (`trigger-remedy.ts`) is the one place that decides what a routine's trigger status asks of the person. `pick_another_event` must never offer Reconnect: the app no longer offers that event, reconnecting changes nothing, and the binding retries only rarely or when the routine is edited. Every surface, the AI Manager included, reads the remedy from here.
- `withParsedFields` (`settings.ts`) drops a `plan_skipped` or `reason` code this client cannot explain, so a surface only ever sees codes it has copy for, even from a newer gateway.

## Spaces and agent moves

`modules/spaces` covers the spaces a caller belongs to, invitations, org creation and moving an agent between spaces. These exist because the gateway runs many tenants, so no host serves them.

- `createOrg` (`create-org.ts`) returns the free slot already taken and a paid org awaiting checkout as outcomes. It is not idempotent; reconcile with `listOrgs`. `freeOrgTakenSlug` (`create-refusals.ts`) recognizes `free_org_taken` only with its 409 and a slug, so an unrelated error carrying the same word stays a bug.
- `POST /v1/agents/:slug/move` answers `202 {moveId}` because a move restarts the agent's pod. Completion is read by polling the move, never inferred from the agent event stream, which relays only pod-scoped events. The share flow polls to `done` before inviting; inviting mid-move is not allowed (`AgentMoveStatus` in `types.ts`).
- `move-refusals.ts` sorts move answers. `name_taken` is refused before anything starts, so no lock is held and the client's resume record is void (`isMoveRefusedBeforeStart`). `agent_moved` means the move is already done (`isMoveAlreadyDone`). `MoveRePostVerdict` keeps the record for `move_in_progress` and for any other rejection, an older gateway's uncoded 404 included, because only a finished move frees a held lock. `canRetryMoveError` says an unmovable volume and a taken name do not clear on their own.
- `move-out.ts` offers only unlocked destinations, because the gateway refuses a locked one. A `legacy` org sends no billing and keeps the old rule that only Personal moves agents into a team.
- `activeSpaceOrgSlug` (`active-space.ts`) is the slug the gateway resolves the active space to. A team pins it on `x-houston-org`; the personal space sends no header, so its slug comes only from the memberships list. `activeOrgBilling` is the one org-plan contract every surface reads, and it reads from the memberships list because every member can read that.

## Workspaces

`modules/workspaces` serves the workspace list, an agent's raw `.houston/**` docs, the background notes spliced into every conversation, and the sidebar layout. They share a module because they share one addressee, the space the person is in.

- The sidebar layout route takes the server's workspace id from `listWorkspaces`, never a client-side id made up for the personal space (`layoutPath` in `http.ts`). `requireSidebarLayout` holds a dispatched layout to the protocol's strict parser so a bad body fails before it becomes a 400 the caller cannot act on.
- A workspace row without `kind` comes from a single-player or self-host host and reads as personal (`WorkspaceKind` in `types.ts`).
- `resolveActiveWorkspace` (`selection.ts`) picks the last chosen workspace, then the device's choice, then the first team, then the default, then the first row.
