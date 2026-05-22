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

## Dogfooding Houston (validating from the client POV)

Before merging substantive feature PRs, exercise the change against the running
app — not just against `cargo check` and `pnpm typecheck`. Houston is a Tauri +
sidecar app, so the canonical interaction surfaces are hybrid (engine API,
WebView via `cliclick`, real Chrome at `:1420` via Interceptor for the vite
frontend). Full pattern + surfaces matrix + canonical arc + gotchas at:

- **`docs/development/dogfood-pattern.html`** — the canonical Houston dogfood
  loop, captured from a real PR (the Tauri + sidecar worked example)

The shape of a Dogfood Plan to include in your PR body (or `docs/dogfood-
plan.md` if you prefer a file):

```markdown
**Dogfood Plan** (stack: tauri-sidecar)

- **Entry surface**: <route, window, CLI command, or API endpoint changed>
- **Driver**: <engine API curl, cliclick coords, Interceptor at :1420, screencapture>
- **Evidence**: <screenshot path, response body, log line, recording>
- **Smoke**: <one-line "didn't obviously break" check>
- **End-to-end**: <multi-step user flow the change is supposed to support>
- **Receipt anchor**: <PR comment, file, or message-id where evidence lives>
```

The Dogfood Plan is the *upstream* of the Dogfood Receipt (the evidence
table you produce before claiming the work complete). Reasoning isn't
validation; interaction is.

Related: this pattern composes with the [bstack P11 cookbook](https://github.com/broomva/bstack/blob/main/references/dogfood-patterns.md)
which generalizes the same shape across other stacks (Next.js, Expo RN, Rust
CLI, REST API, MCP server). RFC tracking: [#243](https://github.com/gethouston/houston/issues/243).
