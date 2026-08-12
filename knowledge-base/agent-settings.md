# Agent settings — the ONE per-agent configuration surface

`app/src/components/agent-settings/` is the single home for "configure THIS agent",
so nothing else names these sections or switches these bodies. One section union, one
gating model, one section switch.

## The one door

Agent settings are **manager-only** and have ONE door: the **Agent settings** lozenge on
the agent's OWN screen (click the agent in the rail, then the door —
`visibleAgentSections` adds `"settings"` for `isAgentManager(caps, agent)` only).
`AgentDetail` (`app/src/components/permissions/agent-detail.tsx`) is the page plus its
header: a back chip wearing the agent's avatar + name (returns to the agent's board) over
plain lozenges — Job description (first, carries the heading) | Skills | Learnings |
People | Integrations | AI Models | Settings. The gate is
`canOpenAgentSettings(caps, agent)` (`lib/agent-nav.ts`) = `isAgentManager`; a non-manager
has no door and no read-only face — for them the page does not exist.
`openAgentSettings(agentId, section?)` (`lib/open-agent.ts`) is the one way to perform the
navigation, and it refuses out loud (a toast) rather than falling back.

**The one-shot deep link.** A caller from OUTSIDE the agent screen (a turn summary's "the
agent updated its job description" link, a Team Settings agent row) calls
`useAgentSettingsNav.getState().requestAgentDetail(agentId, section?)`
(`app/src/components/team-view/agent-settings-nav-store.ts` — two flat fields,
`requestedAgentId` / `requestedSection`, plus `clearRequested()`) right before
`openTeamView(team, "settings", { agentFilter, agentFocus: true })`. The view consumes it
on mount AND while already open, then clears it, so a later plain click lands on the
default section.

**People owns the Share affordance.** The People section's hero carries the Share button
(`agent-settings-people-hero.tsx`); `agentShareSurface(caps, agent, isPersonalSpace)`
decides which face — the people sheet in a team space, or the C8 share-via-team flow in a
personal one.

## The section model — `agent-settings-nav.ts`

```ts
type AgentSettingsSection =
  | "job-description" | "skills" | "learnings"
  | "people" | "integrations" | "models"
  | "manage";
```

`SECTION_GROUP` maps each section to `"context"` / `"permissions"`, read only by the
deep-link fallback so a hidden section lands on its own group's first item.

| builder | returns |
| --- | --- |
| `agentAccessSections(caps)` | `[]` outside multiplayer · `[people]` on legacy multiplayer · `[people, integrations, models]` with `caps.teams` |
| `agentSettingsSections(caps)` | the page order: `job-description, skills, learnings, ...access, manage`. No per-caller gate — the DOOR carries it (`visibleAgentSections` offers Settings to agent-managers only), so everyone who reads this list manages the agent |
| `SECTION_TITLES` | the short lozenge titles; the access sections' HERO titles are `teams:agentAdmin.heroes.*` ("Allowed People/Integrations/AI Models") |
| `targetToSection(target)` | turn-summary file target → section |

`AgentSectionProps` (`{ agent }`) is the contract every section BODY honors.

The **manage** section (`agent-settings-manage.tsx`) is the agent's
settings-inside-settings: Change color & name (one staged dialog,
`agent-actions/agent-identity-dialog.tsx` + `use-agent-identity-save.ts`, which SEQUENCES
rename before color because a rename moves the folder-derived agent id), Move to another
team, Move to another organization (personal spaces, reusing the share-via-team flow),
Delete agent.

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

## The page — `agent-detail.tsx` + `agent-settings-page.tsx`

`AgentDetail` renders the header (`agent-detail-header.tsx`: the avatar+name back chip
over the section lozenges, `[data-agent-section-tab]`) and `AgentSettingsPage`
(`{ agent, initialSection?, onSectionShown? }`) renders the selected section. One section
is always selected; the caller owns the way out (the back chip). The page carries NO
authority — the door is manager-only and the gateway is the sole enforcer.

## The switch — `agent-settings-section.tsx`

`AgentSettingsSectionView({ agent, section })`. Every branch COMPOSES the existing section
component, so no two surfaces can drift:

| section | body |
| --- | --- |
| `job-description` | `AgentAdminInstructions` (in `FillColumn`; the lozenge carries the page heading) |
| `skills` | `AgentAdminSkills` |
| `learnings` | `AgentAdminKnowledge` |
| `people` | `AgentSettingsPeople` (its own hero with the Share button trailing; personal spaces render the create-organization invite face) |
| `integrations` / `models` | `AgentAdminIntegrations` / `AgentAdminModel` in `HeroAccessColumn` (`PageHero` with the `teams:agentAdmin.heroes.*` "Allowed ..." titles) |
| `manage` | `AgentSettingsManage` (see the section model above) |

The access bodies still live in `components/agent/agent-admin/`. `AccessColumn` /
`FillColumn` keep every body on the same `max-w-3xl` column so nothing shifts as sections
switch.

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
- `packages/web/e2e/agent-policy.spec.ts` — the drilled page's lozenges, both choice
  directions and their confirms, the static everyone-mode roster, and that a non-manager
  has no settings door at all (`openAgentSettings(page, agent, section?)` in
  `e2e/support/team-nav.ts` walks the agent screen's door). (The self-lockout branch is
  unit-only: identity is off in the chromium project, so nothing ever resolves as
  "self".)
