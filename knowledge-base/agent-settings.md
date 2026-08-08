# Agent settings — the ONE per-agent configuration surface

`app/src/components/agent-settings/` is the single home for "configure THIS agent". It is
now the ONLY place an agent is configured: the per-agent **Context** / **Admin** tabs are
gone with the rest of the agent tab shell, so nothing else names these sections, renders a
rail, or switches these bodies. One section union, one gating model, one rail component,
one section switch.

## The two doors

**Two doors, one page:** **Team Settings → the agent's row** (every deployment, and single
player's only door) and **Settings > Permissions → the agent's row** (multiplayer
owner/admin only). Programmatic navigation always takes the Team Settings door
(`openAgentSettings`, gated on `canOpenAgentSettings`).

Both mount the SAME `AgentDetail` (`app/src/components/permissions/agent-detail.tsx`), which
is the page plus its header:

| Door | Where | Who |
| --- | --- | --- |
| **Team Settings → the agent's row** | `team-view/team-settings.tsx` | everyone the team's own section list lets in (`visibleTeamSectionsForTeam`) — **single player included**, where it is the ONLY door |
| **Settings > Permissions → the agent's row** | `permissions/permissions-view.tsx` | multiplayer owner/admin only (the section lives inside the `showOrganization` block) |

So the page's real gate is `canOpenAgentSettings(caps, agent)` (`lib/agent-nav.ts`) =
`canSeeTeamSettings(caps) || isAgentManager(caps, agent)`. It takes the AGENT because Team
Settings is a per-team door: single player always; multiplayer the org owner/admin for any
agent, plus a plain member for the agents they MANAGE (managing one is exactly what opens
that team's Settings row). Every "configure this agent" affordance must make that check
before rendering, or it offers a link that resolves back to Mission Control.
`openAgentSettings(agentId, section?)` (`lib/open-agent.ts`) is the one way to perform the
navigation.

Reaching the page is NOT the same as editing it. `isAgentManager` decides the FACE:
`AgentDetail` passes `readOnly` to `AgentSettingsPage`, so an admin (or a manager-member on
another agent of the same team) reads every section instead of hitting a dead end. A plain
member who manages nothing in the team gets no Settings section at all — for them the page
does not exist rather than existing read-only.

**The one-shot deep link.** Team Settings owns its drill-in as local state, so a caller from
OUTSIDE the team view (a turn summary's "the agent updated its job description" link) calls
`useTeamSettingsNav.getState().requestAgentDetail(agentId, section?)`
(`app/src/components/team-view/team-settings-nav-store.ts` — two flat fields,
`requestedAgentId` / `requestedSection`, plus `clearRequested()`) right before
`openTeamView(team, "settings")`. The view consumes it on mount AND while already open, then
clears it, so a later plain click on the Settings row lands back on the agent list. It is the
ONLY such pin: the Permissions door once had an identically-shaped twin
(`permissions/permissions-nav-store.ts`), written only by the blocked-app "Enable it in
Permissions" CTA, and it was deleted with that CTA and the locked-row surface. The
Permissions door is now reached by clicking the agent's row, nothing else.

**The header carries the agent's Share affordance.** `AgentShareSurfaces` — the people sheet
in a team space, the read-only "who has access" list for a member, and the C8
share-via-team flow in a personal space — used to hang off the per-agent header, which no
longer exists. `AgentDetail` is where an agent is addressed now, so the Share button lives in
its `PageHeader` `trailing` slot beside "Open agent" (which leaves for the agent's team board
via `openAgentBoard`). `agentShareSurface(caps, agent, isPersonalSpace)` decides which of the
three, or `"none"`.

Related: `teams.md` (the Permissions screen, roles, the Share dialog, the allowlist
ceilings), `teams-ui.md` (Team Settings, the section that hosts the other door),
`agent-manifest.md` → *Where an agent's surfaces live* (the full destination map).

## The section model — `agent-settings-nav.ts`

```ts
type AgentSettingsSection =
  | "job-description" | "learnings"          // group "context"
  | "people" | "integrations" | "models" | "skills";  // group "permissions"
```

`SECTION_GROUP` maps each section to its group, independent of any host's capabilities.

Builders (pure, caps-only — no agent-shaped predicate exists in these gates):

| builder | returns |
| --- | --- |
| `contextSections()` | `[job-description, learnings]`, unconditional |
| `agentAccessSections(caps)` | `[]` outside multiplayer · `[people]` on legacy multiplayer · `[people, integrations, models]` with `caps.teams` |
| `agentSettingsGroups(caps)` | the settings PAGE rail: Context group + Permissions group (`agentAccessSections` + `skills`, which has no org gate). The ONLY rail builder |
| `agentSettingsSections(groups)` | the flat rail order |
| `targetToSection(target)` | turn-summary file target → Context section |

`AgentSectionProps` (`{ agent, readOnly? }`) is the contract every section BODY honors.

Unit test: `app/tests/agent-settings-nav.test.ts`.

## Selection + deep links — `agent-settings-selection.ts`

- `resolveAgentSettingsSection(groups, requested)` — the section to show. A requested
  section this host hides falls back **inside its own group** (an Apps request is a
  Permissions intent; landing on the job description would answer a question nobody asked),
  and only falls back to the first rail item when that group is absent from the rail at all.
- `advanceAgentSettingsSelection({ groups, pending, current })` — one step of the page's
  selection, returning the section to show plus the request still awaiting a rail that can
  honor it. A request is **retained until honored once**: `/v1/capabilities` lands after the
  first render, so a deep link into Apps would otherwise be resolved away against a rail that
  does not yet show Apps, and never re-applied. Once honored it is retired, so a later caps
  reload never yanks the user off a section they picked by hand.

## The page — `agent-settings-page.tsx`

`{ agent, initialSection?, readOnly?, onSectionShown? }`. Master-detail: the grouped rail on
the left, the selected section on the right. One section is always selected, so the page has
no back navigation; the caller owns the way out. It carries NO authority — `readOnly` is the
caller's decision and the gateway is the sole enforcer.

`onSectionShown` reports the section ACTUALLY on screen (never the raw request), which is
what Permissions tracks as `tab_opened` / `permissions:<section>`.

## The rail — `agent-settings-rail.tsx`

One component for every surface. Group titles render only when there is more than one group
— the page always passes two, so both are labelled (`agentSettings.groups.*`); the
single-group case survives for a rail that ever needs one flat unlabelled list. Selected
rows use the sidebar row language (`bg-hover` fill +
`aria-current`), no hover-only affordance, `px-3 py-4` inset.

`aria-label` = `agentSettings.railLabel` ("Agent settings sections") — the handle e2e specs
scope rail lookups to, because the app sidebar carries same-named entries (Skills, AI models).

Badges: learnings count, and the People count from `agentPeopleCount` (the RESOLVED roster).
The raw `assignments` array is not the count: the everyone sentinel is `[]` (no badge at all)
and an explicit roster omits the always-present org owner.

Section titles reuse existing copy — `agents:subTabs.*` for job description + Skills,
`teams:agentAdmin.rows.*` for the rest.

## The switch — `agent-settings-section.tsx`

`AgentSettingsSectionView({ agent, section, readOnly })`. Every branch COMPOSES the existing
section component, so no two surfaces can drift:

| section | body |
| --- | --- |
| `job-description` | `AgentAdminInstructions` |
| `learnings` | `AgentAdminKnowledge` |
| `people` | `AgentSettingsPeople` (in `AccessColumn`) |
| `integrations` | `AgentAdminIntegrations` (in `AccessColumn`) |
| `models` | `AgentAdminModel` (in `AccessColumn`) |
| `skills` | `AgentAdminSkills` |

The bodies still live in `components/agent/agent-admin/`. `AccessColumn` gives the flush
access bodies the same `max-w-3xl px-6 pt-2` column the self-padded bodies bring, so nothing
shifts as the rail switches sections.

## People — the team-wide choice + the roster

`agent-settings-people.tsx` owns the org query (so the roster refetches on mount when stale
and the body waits behind a skeleton), the single `useShareAgent("agent_settings_people")`
mutation, and both confirms. The roster below is `agent-people-tab.tsx` +
`agent-person-row.tsx` over the pure `agent-people-model.ts`.

**One write channel.** The mutation is created once and passed into the roster, so an
in-flight assignment write disables the choice AND the rows, and two set-replaces can never
race into a lost update.

**The choice** is the shared `AccessChoice` segmented control: **"Everyone on your team"** vs
**"Only specific people"**, wired to the EXISTING everyone-agent sentinel, not a new concept
— an empty assignee set means org-wide (`isSharedWithEveryone`), any explicit set means
exactly those people. Pure model `agent-people-choice.ts` (unit test
`app/tests/agent-people-choice.test.ts`):

- `agentAccessMode(agent)` → `"any"` | `"picked"`, the `AccessMode` vocabulary `AccessChoice`
  speaks.
- `canChooseAgentAccess(members)` — the choice hides until the roster is readable: with no
  members to expand, "Only specific people" would write the empty set and mean the opposite
  of its label.
- `everyoneAssignments()` → `[]`.
- `materializeRoster(...)` — `buildSharePeople` expanded to explicit `{userId, access}[]`,
  exactly what the first per-person edit already does. Nobody's access changes.
- `agentPeopleCount(...)` — the resolved roster size (rail badge + confirm copy).
- `everyoneSwitchConfirm(...)` → `"selfLockout"` | `"changesAccess"` | `"none"`.

**Both directions confirm**, because both replace the whole roster in one write:

| direction | confirm | variant |
| --- | --- | --- |
| → Everyone, viewer holds a non-owner Manager grant | `share.selfLockout.*` — they demote THEMSELVES (the sentinel cannot carry a Manager grant) and lose the page | destructive |
| → Everyone, someone else's access changes | `agentSettings.people.confirmEveryone.*` | default |
| → Everyone, nothing changes | none — written straight through | — |
| → Only specific people | `agentSettings.people.confirmSpecific.*`, naming how many people it freezes and that new teammates are not added automatically | default |

The specific direction ALWAYS confirms: the roster it materializes is a snapshot, and a 30s
`staleTime` means freshness cannot be proven, so the write is stated rather than assumed.

**"Everyone" mode renders the roster STATIC** (no per-person controls, a muted
`agentSettings.people.everyoneNote`). Per-person levels are not the agent's state while the
sentinel is set, and a live control there would silently materialize the roster — the mirror
of the confirm-gated switch. Same idiom as `AllowlistEditor`, which stops offering per-item
controls in its "any" mode.

**Accessibility.** The visible `<h2>` question names the radio group via `aria-labelledby`
(never a duplicate `aria-label`), so a screen reader announces it once. `AccessChoice` takes
`labelledBy`, and all three of its callers (people, apps, models) pass their heading id.

## Read-only

`readOnly` renders every section's non-manager face: People rows drop to static level labels
(plus `permissions.agentPeople.readOnlyHint`), the Integrations + AI Models editors disable
their controls and hide their "Add" lists, and Skills drops the discovery tabs. Nothing is
hover-gated.

One caller decides it for both doors: `AgentDetail` passes `!isAgentManager(caps, agent)`, so
an admin who can SEE an agent but doesn't manage it reads the whole page instead of hitting a
dead-end note. The gateway is the enforcer either way — `readOnly` only avoids a dead
control.

## Analytics

`useShareAgent(source)` takes its `source` from the caller (`"share_dialog"` |
`"agent_settings_people"`) and fires `agent_shared` only on an actual widening,
`accessWidened` (`components/agent/agent-access-diff.ts`, unit test
`app/tests/agent-access-diff.test.ts`): resolved roster before vs after, so the everyone
switch (the broadest share, and an EMPTY array on the wire) counts and materializing the
sentinel does not.

## Tests

- `app/tests/agent-settings-nav.test.ts` — sections, group builders, fallback, selection.
- `app/tests/agent-people-choice.test.ts` — the choice, the confirms, the count.
- `app/tests/agent-people-model.test.ts` — the per-person roster math.
- `app/tests/agent-access-diff.test.ts` — what counts as sharing.
- `app/tests/agent-admin-a11y.test.ts` — the rail renders no `<h1>`; `AccessChoice` moves
  focus with selection.
- `packages/web/e2e/permissions.spec.ts` — the rail's six sections, both choice directions
  and their confirms, the static everyone-mode roster, the read-only drill-in, plus BOTH
  doors: the Settings > Permissions list and the Team Settings route
  (`openAgentSettings(page, agent)` in `e2e/support/team-nav.ts`, which clicks the Team
  Settings row then the agent's row), including that a plain member cannot reach the page at
  all. (The self-lockout branch is unit-only: identity is off in the chromium project, so
  nothing ever resolves as "self".)
