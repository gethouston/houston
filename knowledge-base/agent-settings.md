# Agent settings — the ONE per-agent configuration surface

`app/src/components/agent-settings/` is the single home for "configure THIS agent". Every
surface that shows agent settings — the Settings > Permissions drill-in and the per-agent
**Context** / **Admin** tabs — names its sections, renders its rail, and switches its bodies
from this directory. Nothing is forked: there is one section union, one gating model, one
rail component, one section switch.

Related: `teams.md` (the Permissions screen, roles, the Share dialog, the allowlist
ceilings), `agent-manifest.md` (the tab set itself).

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
| `agentSettingsGroups(caps)` | the settings PAGE rail: Context group + Permissions group (`agentAccessSections` + `skills`, which has no org gate) |
| `contextTabGroups()` | the Context tab's rail: one group, the Context sections |
| `adminTabGroups(caps)` | the Admin tab's rail: one group, the access sections (no Skills — that is its own tab). `[]` in single player, where the tab renders nothing |
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

One component for every surface. Group titles render only when there is more than one group,
so the tabs' single flat list is unlabelled and the page's two groups are labelled
(`agentSettings.groups.*`). Selected rows use the sidebar row language (`bg-hover` fill +
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

The bodies still live in `components/tabs/agent-admin/`. `AccessColumn` gives the flush
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

Callers: the Context tab passes `!isAgentManager(caps, agent)`; the Permissions drill-in
passes it too, so an admin who can SEE an agent but doesn't manage it reads the whole page
instead of a dead-end note. The gateway is the enforcer either way — `readOnly` only avoids a
dead control.

## Analytics

`useShareAgent(source)` takes its `source` from the caller (`"share_dialog"` |
`"agent_settings_people"`) and fires `agent_shared` only on an actual widening,
`accessWidened` (`components/tabs/agent-access-diff.ts`, unit test
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
  and their confirms, the static everyone-mode roster, the read-only drill-in, plus the same
  sections on the agent's Admin tab. (The self-lockout branch is unit-only: identity is off
  in the chromium project, so nothing ever resolves as "self".)
