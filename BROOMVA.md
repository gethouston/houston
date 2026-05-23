# BROOMVA

This is a friendly fork of [`gethouston/houston`](https://github.com/gethouston/houston) maintained by [`@broomva`](https://github.com/broomva). All upstream code is preserved verbatim under its original MIT license (©2026 ja-818) — see [`LICENSE`](./LICENSE). Our patches sit on top of upstream and are individually proposed back upstream as PRs.

## What this fork is (and isn't)

**Is** — a tracking fork that lets us move at our own velocity for downstream consumers (our own builds, our own agent-driven workflows) while most patches are also contributed back as individual upstream PRs. Diff against upstream stays as small and recoverable as the toolchain allows.

**Is not** — a hard fork. We carry as few divergent patches as possible. If upstream rejects a feature change, the fork-side companion is closed and the commit reverted. The fork-exclusive artifacts are:

- `BROOMVA.md` (this file) — attribution + provenance
- `.github/workflows/sync-upstream.yml` — daily-sync automation
- **Package manager: `bun` instead of upstream's `pnpm`** — a deliberate, accepted divergence (not upstreamed; [#247](https://github.com/gethouston/houston/pull/247) closed). This is the one structural patch we maintain across every sync: it touches `package.json`, lockfiles, workspace scripts, husky, and CI. See **Sync policy** for the conflict playbook it requires.
- Agent-harness gitignore entries + the fork-workflow docs (also fork-only).

Everything else flows upstream eventually or is reverted.

## Patches currently on `main`

After a consolidation pass (19 scattered PRs → 8), the upstream-bound patches are:

| Patch | Upstream PR | Status |
|---|---|---|
| `docs(readme): correct monorepo layout counts` | [#246](https://github.com/gethouston/houston/pull/246) | OPEN |
| `feat(engine-client): non-Tauri config fallback` | [#249](https://github.com/gethouston/houston/pull/249) | OPEN |
| `fix(installer): surface claude-code install failures (closes #231)` | [#258](https://github.com/gethouston/houston/pull/258) | OPEN |
| `fix(claude-runner): disallow AskUserQuestion in headless -p` | [#263](https://github.com/gethouston/houston/pull/263) | OPEN |
| `feat(settings): advanced mode — infra + worktrees (A1)` | [#267](https://github.com/gethouston/houston/pull/267) | OPEN |
| `feat(settings): advanced mode — context meter (A2, stacks on #267)` | [#269](https://github.com/gethouston/houston/pull/269) | OPEN |
| `feat(scripts): optional contributor tooling` | [#271](https://github.com/gethouston/houston/pull/271) | OPEN |
| `chore: agent-driven dev workflow (RFC #243/#251 companion)` | [#272](https://github.com/gethouston/houston/pull/272) | OPEN |

Fork-exclusive (not upstreamed): the **`bun`** package manager ([#247](https://github.com/gethouston/houston/pull/247) closed), `BROOMVA.md`, `sync-upstream.yml`, agent-harness gitignore entries, and the fork-workflow docs.

Open RFC discussions on upstream (no code, soliciting maintainer signal):

- [#243 — bstack primitives + control-metalayer for autonomous-agent dev workflows](https://github.com/gethouston/houston/issues/243)
- [#248 — Advanced settings: feature-flag-gated developer capabilities](https://github.com/gethouston/houston/issues/248)
- [#251 — agent-driven development workflows on Houston](https://github.com/gethouston/houston/issues/251)
- [#255 — adopt bstack P11 Dogfood Pattern in CONTRIBUTING](https://github.com/gethouston/houston/issues/255)
- [#256 — dogfood-validation pattern + Lexical-editor input gotcha](https://github.com/gethouston/houston/issues/256)

When upstream merges a PR, the local commit becomes redundant and drops out on the next sync. When upstream closes one, we close the fork-side companion and revert the local commit — except the accepted `bun` divergence, which we keep.

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

Because the fork runs `bun` while upstream runs `pnpm`, **every sync conflicts** on `package.json`, the lockfiles (`bun.lock` vs `pnpm-lock.yaml`), workspace scripts, husky, and CI. This is expected, not an anomaly. Resolve it the same way each time:

1. Take the **fork** side for `package.json` `scripts` + `packageManager`, `bun.lock`, husky hooks, and any `bun`-based CI workflow.
2. Take the **upstream** side for real dependency changes (added/removed/bumped packages in `dependencies` / `devDependencies`).
3. Delete any reintroduced `pnpm-lock.yaml`; run `bun install` to regenerate `bun.lock` against the merged `package.json`.
4. `bun run typecheck` + `cargo check` before pushing the resolved sync.

Any sync that touches none of those files fast-forwards clean.

## Repo settings

The fork has been configured for the friendly-fork model:

| Setting | Value | Reason |
|---|---|---|
| `allow_auto_merge` | `true` | Enable auto-merge UI for future PRs |
| `allow_squash_merge` | `true` | Squash is the merge style (one commit per PR on main) |
| `allow_merge_commit` | `true` | Allowed but not preferred |
| `delete_branch_on_merge` | `false` | **Critical** — fork-merge must NOT delete the branch, because the same branch is also the head of the upstream PR. Delete would orphan upstream. |
| `allow_update_branch` | `true` | UI option to refresh fork PRs against latest main |

Branch protection on `main`: the `CI Success` check is **required**. Fork PRs merge with `gh pr merge --squash --auto`, which fires once CI passes — never `--admin` to bypass it. `ci.yml` already lives on fork `main` (that check is what gates merges); the upstream-bound copy rides in the consolidated #272.

## Building from the fork

The fork uses **`bun`** instead of upstream's `pnpm` (the one structural divergence — see above); the Rust / `cargo build` pipeline is unchanged. Two operational notes:

- **Signing certs are NOT shared.** Apple Developer ID, App Store Connect API keys, Tauri updater signing keys — see upstream's `release.yml` for what you'd need to wire up for your own signed macOS / Windows builds.
- **Service tokens are NOT shared.** PostHog, Supabase, Sentry, Linear — same story. The build will compile without them; features that depend on them degrade gracefully.

## How to consume this fork

Treat it like any other GitHub fork:

```bash
git clone https://github.com/broomva/houston.git
cd houston
bun install
cd app && bun run tauri dev
```

For agent-driven workflows on top of Houston, see `knowledge-base/agent-dogfood-loop.md` (added in [#250](https://github.com/gethouston/houston/pull/250) / local commit `7d6b4da`).

## License

MIT. Unchanged. ©2026 ja-818 for the upstream copyright; our patches inherit the same MIT terms. See [`LICENSE`](./LICENSE).
