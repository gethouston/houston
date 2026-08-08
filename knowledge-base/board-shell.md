# Board shell — kept-alive screens, keyboard ownership, the ONE panel

Several top-level screens stay MOUNTED at once (`shell/keep-alive-views.tsx`), so
anything a screen publishes into the UI store or portals into the shared detail
panel is last-writer-wins. These are the rules that keep exactly one screen in
charge. Which screens exist and how the rail navigates them → `teams-ui.md`.

## Who is on the glass

- **`useIsActiveView()`** (`app/src/components/shell/keep-alive-views.tsx:13`, reads
  `IsActiveViewContext`) is the one answer to "is this screen the one the user is
  looking at". Every consumer lives under `app/src/components/board/`.

## Two board predicates, and they are not interchangeable

Both in `app/src/lib/top-level-views.ts`:

| Predicate | Definition | Gates |
| --- | --- | --- |
| `isMissionBoardView(viewMode)` (`:67`) | `dashboard \|\| team` — VIEW level, coarse | **⌘N** (`hooks/use-keyboard-shortcuts.ts:99`) and the **command palette** (`components/command-palette.tsx:140`) |
| `isMissionBoardSurface({viewMode, teamSection})` (`:86`) | dashboard ⇒ true; non-team ⇒ false; else `teamSection === null \|\| "mission-control"` | **board arrows** (`use-keyboard-shortcuts.ts:176`) and **bare Enter** (`:192`) |

The asymmetry is deliberate and noted in-code (`use-keyboard-shortcuts.ts:92-98`):
⌘N and the palette have a FALLBACK — off a board they navigate to the board that owns
the handler (`openAgentBoard(current)`) and fire once it has registered — so the coarse
view test is enough. Arrows and bare Enter have no fallback and must not
`preventDefault()` while a team's Routines/Files/Settings section is open.

⌘N and the palette also check for the HANDLER, not just the view
(`isMissionBoardView(viewMode) && onStartMission`), because Team Settings, Routines,
Files and an empty team mount no board.

## Registration is gated on being active

- Every registration is wrapped in `useIsActiveView()`: `onStartMission`
  (`use-mc-new-mission.tsx`), `onBoardNavigate` / `onBoardOpen` / `onPanelClose`
  (`use-board-keyboard.ts`), the empty-board auto-open, and the team Routines panel's
  portal + claim. Unconditional registration let a HIDDEN team board keep the arrows,
  so Enter opened an invisible mission's chat into the shared panel.
- The guard is `if (!isActive) return;` with **no cleanup on the inactive path**. React
  runs the whole commit's destroy pass before its create pass, so the outgoing screen
  releases and the incoming one claims, in that order. Nulling from the inactive path
  clobbers the screen that just claimed.
- **Going inactive releases everything the screen holds of the ONE panel**: the open
  mission, the claim, AND the empty new-mission composer (reachable only through the
  closer `AIBoard` hands back). Skipping it left `showPanel` stuck true and the panel
  could never reopen. `MissionControlArchived` and the team Routines panel carry their
  own copies, being no `MissionBoard`.

## Two surfaces, and where a published nav lands

A mission board is two boards that SWAP — the ACTIVE one (filters `archived` out) and
the ARCHIVE (keeps only those) — each holding half the workspace. Every "open this
mission" navigation (session-finished notification, @mention row, command palette,
archived → active handoff) publishes a bare mission id as `activityPanelId`.

**Which surface can show it is decided ONCE, from the RAW sweep rows, above both
boards.** Asking a BOARD ("do you have this mission?") answers "no" for half the
workspace and is indistinguishable from "this mission does not exist" — an @mention on
an archived mission then forced the active board on screen and opened the panel on a
null session, a blank chat whose composer swallowed every send.

- **`app/src/lib/board-surface-nav.ts`** — the pure rule. Exports `BoardSurface` (`:29`),
  `SurfaceRow` (`:33`), `pendingMissionSurface()` (`:48`), `surfaceOnActivate()` (`:68`).
  The rows are the shared `all-conversations` query, the key both boards already read
  (*the one-sweep rule*, `teams-ui.md`), so this costs no second fan-out.
- **`useBoardSurfaceOnNav`** (`components/board/use-board-surface-on-nav.ts`) — mounted
  by the OWNER of the two surfaces (`Dashboard`, `team-mission-control.tsx`), the
  component that survives the swap. It puts the named surface on screen
  (`show("archived") | show("active")`).
- **`usePendingMissionTarget`** (`components/board/use-pending-mission-target.ts:32`;
  consumers `mission-control-archived.tsx:57`, `use-mission-control-source.tsx:48`) —
  takes a `surface` (which board is calling) plus the target's `pendingSurface` and
  consumes the target ONLY when they match; a target belonging to the other surface is
  left published and untouched. The guard has to live in the CONSUMER: React runs child
  effects before parent effects, so the board on the glass fires a full commit before
  its owner can route anything, and consuming first is exactly what ate the target.
- **`useArchivedHandoff`** (`app/src/hooks/use-archived-handoff.ts:43`; consumed by
  `board/use-mission-control-archived-panel.ts:45`) — patches the re-activated mission's
  row to `running` in the shared sweep rows BEFORE publishing. The send already landed
  and the engine flips `archived → running` at turn start, but the rows only hear on the
  turn's event; handing off with a stale `archived` row routes the user straight back
  into the archive.

**Archive stickiness.** A kept-alive board comes back exactly as it was left.
`useBoardSurfaceOnNav` restores the rule on the false→true edge of `useIsActiveView()`:
coming back onto the glass shows `surfaceOnActivate(pending)` — the surface a published
nav names, else ACTIVE. A team change already remounts (`TeamMissionControl` is keyed on
`team.id`) and a team section change unmounts the section; this covers the `viewMode`
change, which unmounts nothing. In-view toggling (the toolbar's Archived button, Back)
never leaves the glass and is untouched. On the global board the same edge also drops
the Mentions inbox, a transient sub-surface of the same kind.

## Naming the open mission on a cross-agent board

A per-agent board knew whose mission it was showing; a cross-agent one does not. The
SELECTED CARD carries both facts (session key + agent path) and the sweep produces the
card, so four modules cover the beat before it does.

| Module | What it holds |
| --- | --- |
| `components/board/use-mc-open-conversation.ts` | WHICH conversation is open plus its live feed, read off the selected card's metadata. `AIBoard` only ever reads `feedItems[activeSessionKey]`, so the single-entry map is the whole contract |
| `components/board/use-just-created-mission.ts` | The mission just created, until the sweep returns its row — without it the panel that just opened loses its session key and agent path and eats the user's first message. Dropped the instant the real row lands, which carries the status the turn stream writes |
| `lib/created-mission-handoff.ts` | The wire for a mission created OUTSIDE any board (the agent's self-setup mission, fired from a dialog by a module-level function that cannot reach a hook's setter): a module-level publisher plus a subscriber hook. The offer is **read, never claimed** — several boards are kept alive and a one-shot would be taken by whichever mounts first, measurably a HIDDEN one; a TTL rather than a claim keeps it from leaking into a LATER create. Dependency-free but for a clock, so `node --test` drives it directly |
| `hooks/use-warming-conversations.ts` | The optimistic warm-up rows: every mission queued while some agent's engine cold-starts, shaped as a `running` conversation the sweep never returned. Empty and STABLE when nothing is warming, so consumers merge unconditionally; the store's `sendsVersion` is the re-render signal, since entries mutate in place |

## Tests

- `app/tests/board-surface-nav.test.ts` — which surface a published target belongs to,
  and the stickiness reset.
- `app/tests/created-mission-handoff.test.ts` — adopt-many, TTL, replace-on-republish.
- `packages/web/e2e/board-keyboard-ownership.spec.ts` — only the screen on the glass owns
  the arrows and Enter.
- `packages/web/e2e/shell-panel-ownership.spec.ts` — the shared panel, including the team
  Routines chat releasing it when the team leaves the glass and taking it back on return.
- `packages/web/e2e/archived-mention-nav.spec.ts` — an @mention on an ARCHIVED mission
  opens it on the ARCHIVE with its history, and its composer still sends and hands back.
- `packages/web/e2e/agent-archived-button.spec.ts` — the archive's entry/exit controls and
  both stickiness resets (the team section that unmounts, the kept-alive global board that
  does not).
