# Advanced: Git panel

Surfaced by the `advanced.git_panel` flag in Settings → Advanced (Phase 3 of RFC #248).

## What it does

When the flag is on AND the active agent's working directory is a git repository, a new **Git** tab appears next to the agent's other tabs. The panel is **read-only in v1**:

- **Status** — branch + per-file status, color-coded by category (added / modified / deleted / renamed / untracked). Selecting a row drives the diff viewer.
- **Log** — recent commits (default 50), with short sha, subject, author, relative date.
- **Diff** — unified diff text for the selected file, with simple +/− coloring.

Non-git directories are handled gracefully: the tab simply doesn't appear (the flag is enabled but the per-agent check declines). If the user lands on the tab via a stored `viewMode` and the repo check changes, the empty state shows the actual cwd and a hint to either point the agent at a repo or run `git init` there.

## Architecture

### Engine (already shipped in Phase 3 PR A)

| Function | What |
|---|---|
| `is_repo(cwd)` | boolean — used by `useIsGitRepo` to gate the tab |
| `status(cwd)` | `{ entries, branch }` from `--porcelain=v1 --branch -z`, parses rename `orig_path` |
| `log(cwd, limit?)` | `[{ sha, author, date_iso, subject }]`, default 50, capped 500 |
| `diff(cwd, path?)` | raw unified diff text (whole-tree or one path) |

Lives in `engine/houston-engine-core/src/git.rs`. Routes at `POST /v1/git/{status,log,diff}` (`engine/houston-engine-server/src/routes/git.rs`). Always on per RFC #248 enforcement-split table.

"Not a git repo" surfaces as `CoreError::Labeled` with stable kind `git_not_a_repo` — the frontend matches on this to render the empty state without burning a toast.

### Frontend

| File | Purpose |
|---|---|
| `app/src/hooks/use-git-queries.ts` | `useIsGitRepo`, `useGitStatus`, `useGitLog`, `useGitDiff` (TanStack Query, errors degrade gracefully via labeled-error matching) |
| `app/src/components/git/git-panel.tsx` | container, two-pane layout (left tabs Status/Log, right Diff) |
| `app/src/components/git/git-status-list.tsx` | porcelain-code → human label + color |
| `app/src/components/git/git-log-list.tsx` | commit row + Intl.RelativeTimeFormat |
| `app/src/components/git/git-diff-viewer.tsx` | raw unified diff with +/− coloring |
| `app/src/components/tabs/git-tab.tsx` | built-in tab adapter (mounts `<GitPanel cwd={agent.folderPath} />`) |
| `app/src/components/shell/workspace-shell.tsx` | injects the `Git` tab into the tab list when flag-on AND repo-check-true |
| `app/src/agents/tab-resolver.ts` | registers `git: GitTab` in `BUILTIN_TABS` |
| `app/src/lib/featureFlags.ts` | `advanced.git_panel` FlagDef |
| `app/src/locales/{en,es,pt}/git.json` | panel labels |
| `app/src/locales/{en,es,pt}/settings.json` | `advanced.flags.git_panel.{label,description}` |
| `app/src/locales/{en,es,pt}/agents.json` | `tabLabels.git` |

## Why it's gated

Git internals are developer information. Most Houston users never need them. Surfacing a git tab on every agent would add visual noise for the non-technical default audience. Flag default-off keeps the existing UX clean; power users opt in once and get the panel on every code-repo agent automatically.

## cwd resolution (v1)

The panel queries `agent.folderPath` directly. For agents whose `.houston/<agent>/` directory IS a git repo (e.g. worktree-mode agents), the panel works as expected. For agents whose work happens in a separate cwd (e.g. an `installCommand` pointing at `~/code/myproject`), the panel shows the empty state. v2 may add a per-agent `gitCwd` config field or auto-derive from `worktreeMode` + active activity worktree.

## Enforcement surface

`enforcementSurface: "ui"`. The `/v1/git/*` engine routes are always on. Custom frontends consuming the engine directly can use git inspection without involving this flag.

## What v2 may add

- Per-agent `gitCwd` config (or auto-derive from active worktree)
- Hunk-parsed diff for syntax highlighting + inline blame
- Branch picker
- Pagination for `log` (currently capped at 500)
- Optional write operations (`stage`, `commit`, `push`) with safety story
- File watcher integration so `status` invalidates without manual refresh

## See also

- `knowledge-base/feature-flags.md` — the 12 rules + adding-a-flag procedure
- `knowledge-base/advanced-worktrees.md` — sibling Phase 1 flag
- `knowledge-base/advanced-context-meter.md` — sibling Phase 2 flag
- RFC: `gethouston/houston#248`
