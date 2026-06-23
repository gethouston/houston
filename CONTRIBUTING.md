# Contributing to Houston

Houston is a small team shipping fast. We're glad you want to help, and we have a posted bar so review stays sustainable.

## Before you open a PR

Read this section. If your PR doesn't fit, we'll close it without arguing.

1. **Open an issue first** for anything that isn't a bug fix under ~50 LOC. No surprise PRs for refactors, new tooling, governance, or docs about how to contribute. If we haven't agreed it's worth building, don't build it.
2. **One open PR at a time** per contributor. Open the next one only after the previous merges or closes.
3. **Scratch your own itch.** The PR must fix a bug you hit or add a feature you actually use in Houston. "I thought the repo could use X" isn't a reason. Speculative improvements are work for us, not value.
4. **AI-generated is fine, you reviewing the diff isn't optional.** Use Claude Code, Cursor, whatever. But you read the diff first. If the PR body has to justify why to ship it ("not really an upgrade but…"), don't ship it. PRs that read as raw autonomous-loop output get closed.
5. **No importing external frameworks.** Don't add your own methodology, RFCs, or doctrine to Houston's `knowledge-base/` or `docs/`. Link from your repo to ours, not the other way around.
6. **Stacked PRs get one shot.** If the base PR doesn't land, the stack is dead. Don't chain four deep.

If you're unsure whether something fits, open an issue and ask. Cheaper than a closed PR for both of us.

## Getting Started

```bash
git clone https://github.com/gethouston/houston.git
cd houston
pnpm install
cargo check --workspace
```

## Development

```bash
# Run the Houston app
cd app && pnpm tauri dev

# Run the showcase
cd showcase && pnpm dev

# TypeScript check
pnpm typecheck

# Rust check
cargo check --workspace

# Rust tests
cargo test --workspace
```

## Structure

- `ui/` — React packages (@houston-ai/*)
- `engine/` — Rust crates (houston-*) — frontend-agnostic backend
- `app/` — Houston App (Tauri desktop)
- `packages/` — TypeScript engine convergence (runtime, control-plane, domain, protocol)
- `cloud/` — Houston Cloud (hosted control plane)

## Pull Requests

1. Confirm your change fits the bar in [Before you open a PR](#before-you-open-a-pr)
2. Create a feature branch from `main`
3. Make your changes
4. Run `pnpm typecheck` and `cargo check --workspace`
5. Open a PR to `main`, fill out the template honestly

## Commit Messages

We use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` — New feature
- `fix:` — Bug fix
- `docs:` — Documentation
- `chore:` — Maintenance
- `refactor:` — Code restructuring

## Code Style

- 200 line file limit (excluding tests)
- No hover-only affordances
- Props over stores in library packages
- No `@/` path aliases in packages
