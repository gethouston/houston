# BROOMVA

This is a friendly fork of [`gethouston/houston`](https://github.com/gethouston/houston) maintained by [`@broomva`](https://github.com/broomva). All upstream code is preserved verbatim under its original MIT license (©2026 ja-818) — see [`LICENSE`](./LICENSE). Our patches sit on top of upstream and are individually proposed back upstream as PRs.

## What this fork is (and isn't)

**Is** — a tracking fork that lets us move at our own velocity for downstream consumers (our own builds, our own agent-driven workflows) while every patch is also being contributed back as an individual upstream PR. Diff against upstream stays small and recoverable.

**Is not** — a hard fork. We don't carry long-term divergent patches. If upstream rejects a change, the fork-side companion is closed too. The only fork-exclusive artifacts are:

- `BROOMVA.md` (this file) — attribution + provenance
- *(future)* `.github/workflows/sync-upstream.yml` — daily-sync automation

Everything else flows upstream eventually or is reverted.

## Patches currently on `main`

| Local commit | Upstream PR | Upstream status |
|---|---|---|
| `chore(ci): add PR-time workflow (typecheck + cargo check + tests)` | [#242](https://github.com/gethouston/houston/pull/242) | OPEN |
| `feat(scripts): houston-doctor.sh pre-PR diagnostic snapshot` | [#244](https://github.com/gethouston/houston/pull/244) | OPEN |
| `chore(deps): add check-cli-deps.sh drift scout` | [#245](https://github.com/gethouston/houston/pull/245) | OPEN |
| `docs(readme): correct monorepo layout counts and missing directories` | [#246](https://github.com/gethouston/houston/pull/246) | OPEN |
| `feat(engine-client): non-Tauri engine config fallback via localStorage` | [#249](https://github.com/gethouston/houston/pull/249) | OPEN |
| `docs(knowledge-base): add agent-dogfood-loop guide` | [#250](https://github.com/gethouston/houston/pull/250) | OPEN |

Open RFC discussions on upstream (no code, soliciting maintainer signal):

- [#243 — RFC: bstack primitives + control-metalayer for autonomous-agent dev workflows](https://github.com/gethouston/houston/issues/243)
- [#251 — RFC: agent-driven development workflows on Houston — strategies, gotchas, and asks](https://github.com/gethouston/houston/issues/251)

When upstream merges any of these PRs, the local commit becomes redundant — it'll show up in the next upstream-sync as a duplicate and squash cleanly. When upstream closes a PR, we close the fork-side companion and revert the local commit.

## Branching policy

Two starting points, depending on intent:

```
Upstream-bound work    → branch off origin/main  (gethouston/houston)
                          PR opens against gethouston/houston:main
                          Optionally: open a fork-side companion PR against broomva/houston:main
                          
Fork-only work         → branch off fork/main    (broomva/houston)
                          PR against broomva/houston:main only
                          Never opens an upstream PR — the change is fork-exclusive
```

This guarantees that fork-exclusive patches (`BROOMVA.md`, sync automation) never accidentally surface in upstream PRs.

## Sync policy

Fork `main` is fast-forwarded from `gethouston/houston:main` on demand:

```bash
gh api repos/broomva/houston/merge-upstream -X POST -f branch=main
```

Or click **Sync fork** on github.com/broomva/houston. We do this:

- Before opening a new upstream-bound PR (start from latest upstream main)
- Weekly as a discipline
- After any of our upstream PRs merge (so the fork picks up our work via the upstream-flow)

If upstream and fork diverge non-trivially (which shouldn't happen under this policy), the sync API returns a conflict — at which point we hand-resolve and re-push.

## Repo settings

The fork has been configured for the friendly-fork model:

| Setting | Value | Reason |
|---|---|---|
| `allow_auto_merge` | `true` | Enable auto-merge UI for future PRs |
| `allow_squash_merge` | `true` | Squash is the merge style (one commit per PR on main) |
| `allow_merge_commit` | `true` | Allowed but not preferred |
| `delete_branch_on_merge` | `false` | **Critical** — fork-merge must NOT delete the branch, because the same branch is also the head of the upstream PR. Delete would orphan upstream. |
| `allow_update_branch` | `true` | UI option to refresh fork PRs against latest main |

Branch protection on `main`: none currently. Could add a required `CI Success` check (from the ci.yml landed via #242) if we want fork-side CI to gate merges; until then, merges are immediate-on-clean.

## Building from the fork

Same as upstream. The patches are additive; nothing in upstream's `pnpm tauri dev` or `cargo build` pipeline is altered. Two operational notes:

- **Signing certs are NOT shared.** Apple Developer ID, App Store Connect API keys, Tauri updater signing keys — see upstream's `release.yml` for what you'd need to wire up for your own signed macOS / Windows builds.
- **Service tokens are NOT shared.** PostHog, Supabase, Sentry, Linear — same story. The build will compile without them; features that depend on them degrade gracefully.

## How to consume this fork

Treat it like any other GitHub fork:

```bash
git clone https://github.com/broomva/houston.git
cd houston
pnpm install
cd app && pnpm tauri dev
```

For agent-driven workflows on top of Houston, see `knowledge-base/agent-dogfood-loop.md` (added in [#250](https://github.com/gethouston/houston/pull/250) / local commit `7d6b4da`).

## License

MIT. Unchanged. ©2026 ja-818 for the upstream copyright; our patches inherit the same MIT terms. See [`LICENSE`](./LICENSE).
