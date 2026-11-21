---
name: delete-comment
description: Remove prose comments from a part of the repo and keep the shrink-only comment baseline honest. Classify each comment, move real decisions into an ADR, file issues for excuses, delete the rest with the comment tools, prove only comments changed, then lower the baseline. Use when check:comments fails or when sweeping a module.
---

# /delete-comment

Code carries no prose comments. `pnpm check:comments` fails when a file has more prose comments than `scripts/comments/baseline.json` allows, and the baseline only goes down. This is the procedure that takes it down.

Tooling comments are never touched and never counted: `@assistant` and `@deprecated` JSDoc, `biome-ignore*`, `@ts-*` directives, `eslint-*`, triple-slash references, bundler and coverage hints, license blocks, JSDoc type tags in plain JS, Rust doc comments, Rust `// SAFETY:` justifications (with their continuation lines), `shellcheck` directives, and the pinned lines in `scripts/comments/config.json`. The full list is `scripts/comments/classify.ts`. Paths in `config.json` `excluded` are out of scope.

## 1. Pick paths

One module or folder per pass, small enough to read every comment: `packages/sdk/src/modules/turns`, `app/src/components/board`. Work in your own worktree on a branch.

## 2. List

```sh
pnpm comments:list <paths...>                    # readable, 4 lines of context
pnpm comments:list <paths...> --context 8        # more context
pnpm -s comments:list <paths...> --json > /tmp/comments.json
```

Keep `-s` whenever the output goes to a file: without it pnpm prints its banner first and the file is no longer JSON.

Each comment has an id `file:line:col`. Consecutive `//` lines are one comment. Largest files come first.

## 3. Classify every comment

| Class | What it is | Act |
|---|---|---|
| **Tautology** | Repeats what the code already says: the name, the type, the next line, the control flow. | Delete. |
| **Stale** | Refers to code, behavior, files or flags that no longer exist or no longer hold. Check with a grep before you call it stale. | Delete. |
| **Excuse** | Justifies a hack: a workaround, "for now", "until X lands", a TODO, a known-wrong shortcut. | Delete, and file one issue per module in the team tracker naming the file, the symbol, the hack and the fix. Refer to it by ID only. Never name the tracker in the repo. |
| **Decision Record** | A non-obvious decision, constraint or external quirk the code cannot show: why this and not the obvious alternative, an upstream bug, a protocol or platform requirement, an invariant other code relies on. | Move it into the module's ADR under `docs/adr/`, then delete. |

The test for a Decision Record: it is one if a maintainer would get the code wrong without it and no existing name, type or test already says it. Otherwise it is a Tautology. If a rename would carry the meaning, the comment is still a Decision Record today: record it in the ADR now and leave the rename for a later change.

ADRs: extend the ADR that already covers the module. If none does, add `docs/adr/NNNN-<slug>.md` with the next number, in the style of the existing ones: a title, the decision in plain prose, and the reasons. One ADR per module or decision, never one per comment. Write it as the current rule, not as history.

Keep the pass comment-only. A rename or a new test that would carry the meaning better is a separate change.

Catalog sources and showcase inputs read comments: deleting comments in an assistant catalog source needs `pnpm gen:assistant-catalog`, and a sweep that reaches what `ui/showcase` scans needs `pnpm --filter @houston-ai/showcase gen:usage` (step 6).

## 4. Apply

Every class ends in a delete. Write the decisions file and apply it:

```json
[{ "id": "packages/sdk/src/modules/turns/turn-vm.ts:41:3", "action": "delete" }]
```

```sh
pnpm comments:apply /tmp/decisions.json
```

Own-line comments lose their lines, trailing comments lose the comment and the space before it, a JSX `{/* */}` loses its braces and its line when nothing else is on it, and a CSS comment wedged between two tokens leaves one space. Blank runs collapse to one, and blank lines left after an opening or before a closing brace go. Touched TS/JS files are run through `biome format`. Apply refuses tooling ids and ids that no longer match the file; run `comments:list` again after editing a file by hand. A file it reports as skipped would change code (usually JSX text whitespace next to a JSX comment): edit that one by hand.

## 5. Verify

Format first, then verify:

```sh
pnpm check:fix
pnpm comments:verify <paths...>                       # base defaults to origin/main
pnpm comments:verify --base <ref> <paths...>
pnpm comments:verify --allow <file> --allow <file>    # reviewed, intentional code edits
```

It compares the non-comment token stream of every changed file against the merge base, and the ordered list of tooling comments, and exits non-zero on any difference, printing the file and both positions. Dropping an `@assistant` block, a `biome-ignore` or a Rust `///` fails it. A run of imports and `export ... from` declarations compares as a sorted set, so Biome re-sorting imports once a separating comment is gone passes. It must pass. New and deleted files are listed apart and not compared.

A deliberate code edit that belongs to the sweep, such as a check script entry that only matched comment text (step 6), gets `--allow <file>`: that file skips the token comparison but still has its tooling comments compared. List every allowed file and the reason for it in the PR body.

## 6. Regenerate what reads source

- `pnpm gen:assistant-catalog` when a catalog source changed (`packages/engine-adapter/src/cp`, `packages/engine-adapter/src/client/*-mixin.ts`, `packages/sdk/src/modules`, `packages/sdk/src/sdk.ts`, `packages/runtime-client/src/client*`). The catalog stamps a hash of those files, so `check:assistant-catalog` fails until it is regenerated.
- `pnpm --filter @houston-ai/showcase gen:usage` when a sweep touched `app/`, `ui/`, `packages/web` or `agentstore/`. The usage map counts imports named in comments too, so `ui/showcase` tests fail until it is regenerated.
- `pnpm check:boundaries`. Rule D counts `getEngine()` even inside comments. If a file in `ENGINE_CALL_BYPASS` only mentioned it in a comment, delete its line from that list, and pass `--allow scripts/check-boundaries.mjs` to `comments:verify`.
- Source-reading tests (`app/tests`, `packages/*/tests`) assert on file text. If one fails because the text it wanted only lived in a comment, fix the test to assert on the code.

## 7. Ratchet and check

```sh
pnpm comments:ratchet      # lowers baseline.json; refuses to raise any entry or add a file
pnpm check:fix
pnpm check                 # includes check:comments
```

`pnpm comments:ratchet --init` only creates a missing baseline. `--init --force` rebuilds it from the current tree and can raise entries, so it is only for a reviewed change to the comment tools themselves, such as widening the languages they read.

Moving or renaming a file listed in `baseline.json` drops its entry and gives the new path an allowance of zero: sweep the file in the same change, or carry its entry over by renaming its key in `baseline.json`, the one hand edit the baseline takes.

Run the tests for the areas you touched (`AGENTS.md`, Verify). Commit the deletions, the ADR changes and `baseline.json` together, for example `chore(sdk): drop prose comments from the turns module`.
