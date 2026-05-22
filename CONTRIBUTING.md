# Contributing to Houston

Thanks for your interest in contributing to Houston!

## Getting Started

```bash
git clone https://github.com/gethouston/houston.git
cd houston
bun install
cargo check --workspace
```

## Development

```bash
# Run the Houston app
cd app && bun run tauri dev

# Run the showcase
cd showcase && bun run dev

# TypeScript check
bun run typecheck

# Rust check
cargo check --workspace

# Rust tests
cargo test --workspace
```

## Structure

- `ui/` — React packages (@houston-ai/*)
- `engine/` — Rust crates (houston-*) — frontend-agnostic backend
- `app/` — Houston App (Tauri desktop)
- `mobile/` — Houston Mobile companion
- `desktop-mobile-bridge/` — Cloudflare Worker pairing App + Mobile
- `store/` — Houston Store (agent registry)
- `website/` — gethouston.ai landing
- `always-on/` · `teams/` · `cloud/` — future hosted products (placeholders)

## Pull Requests

1. Create a feature branch from `main`
2. Make your changes
3. Run `bun run typecheck` and `cargo check --workspace`
4. Open a PR to `main`

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
