# Advanced: Worktrees

Surfaced by the `advanced.worktrees` flag in Settings → Advanced.

## What it does

Reveals the **Worktree mode** toggle inside each agent's Configure tab. When that toggle is on for an agent, every mission you start on that agent runs in its own git worktree so parallel work stays in isolated checkouts.

## How it works

The capability itself is per-agent, not global. The `advanced.worktrees` flag controls **whether the Worktree mode toggle appears in the UI**, not whether worktrees are created. Agents that already have `worktreeMode: true` persisted in their config continue creating worktrees regardless of the flag's state. This matters: turning the global flag off later does not break a user's existing worktree-enabled agents.

When a mission starts on a worktree-enabled agent:

1. Houston creates a fresh git worktree under the repo, named with a short uuid slug.
2. The agent runs the mission with that worktree as the working directory.
3. If the agent has an `installCommand` configured, it runs once inside the new worktree.
4. The board card surfaces a "Run terminal" affordance pointing at the worktree path.

## Why it's gated

Worktrees are a developer concept. Most Houston users never need them. Surfacing the toggle by default would clutter the agent Configure tab for the majority of users who run one mission at a time on a single checkout.

The flag also acts as a one-stop disable: turn it off and the Worktree mode toggle disappears from every agent's Configure tab going forward. Existing per-agent settings keep working at runtime.

## Enforcement surface

`enforcementSurface: "ui"`. The engine's `/v1/worktrees` route stays open whether the flag is on or off. Custom frontends consuming the engine directly (for example `examples/smartbooks/`) can use worktrees without involving this flag.

## Implementation pointers

- Flag entry: `app/src/lib/featureFlags.ts::FLAG_REGISTRY["advanced.worktrees"]`
- Gate site: `app/src/components/tabs/configure-sections.tsx` wraps the Worktree mode row in `<FeatureGate flag="advanced.worktrees">`
- Engine route (unchanged by this flag): `engine/houston-engine-server/src/routes/worktrees.rs`
- Mission-send sites that read `cfg.worktreeMode`: `app/src/components/tabs/board-tab.tsx` and `app/src/components/use-agent-chat-panel.tsx`

## Recommended companion flags

None at the moment. A future `advanced.git_panel` flag (RFC #248 Phase 3) pairs well with worktrees but is independently useful, so the two stay decoupled.

## See also

- `knowledge-base/feature-flags.md` — the 12 rules + adding-a-flag procedure
- RFC: `gethouston/houston#248` — the umbrella RFC for the advanced settings wave
