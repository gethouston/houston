# Contributing to Houston

Thank you for contributing to Houston! We are building the premium, open-source, AI-native platform for autonomous desktop and multi-agent coordination.

To ensure visual excellence, high architectural integrity, and professional release coordination, we follow rigorous codebase standards. Please review this guide before submitting pull requests.

---

## Technical Stack & Quick Start

Houston is a monorepo structured with high separation of concerns between TypeScript/React frontends and a standalone Rust backend.

### Prerequisites

- **Bun** or **Node.js** (v22+)
- **pnpm** (v10+)
- **Rust Toolchain** (Stable)
- **Tauri CLI** (for running the desktop wrapper)

### Setup Development Environment

```bash
# Clone the repository
git clone https://github.com/gethouston/houston.git
cd houston

# Install dependencies (automatically initializes Husky pre-commit hooks)
pnpm install

# Run type-checking & Rust cargo checks
make verify-all
```

---

## Monorepo Architecture & Package Boundaries

All code in Houston lives within strict logical domains to ensure the engine remains highly reusable and the UI stays modular:

1. **`engine/` (Rust Workspace Crates)**: Standalone, frontend-agnostic execution runtime. No Tauri dependencies, no React assumptions. Speaks exclusively HTTP and WebSocket.
2. **`ui/` (React Workspace Packages)**: Generic, props-driven, UI-only `@houston-ai/*` packages. No global state stores (e.g. Zustand, Redux) are allowed inside libraries. Use props over stores.
3. **`app/` (Tauri Desktop App)**: Orchestrates the UI packages and spawns the Rust engine as a sidecar process. Features target-specific adapters linking Tauri endpoints to the Engine protocol.
4. **`mobile/` (React PWA)**: Serves mobile viewport components dynamically.

---

## Strict Coding & UX Standards

We enforce high-fidelity design aesthetics and defensive programming practices. Pull requests violating these rules will be rejected:

### 1. File Size Constraints & Organization
- **Maximum 200 lines per file** for all JavaScript, TypeScript, and Rust source files (excluding unit tests). If a file exceeds this length, extract modules.
- **Maximum 500 lines for CSS files**. Keep layout systems clean and modular.

### 2. Banned UX and UI Anti-Patterns
- **No hover-only affordances**: All interactive elements (buttons, edit triggers, delete controls) MUST be fully visible without hovering. Hover effects should enhance, never gate.
- **Rich Aesthetics & Color Harmonies**: Use premium gradients, glassmorphism, dynamic transitions, and modern typography. Never use generic or raw CSS colors.

### 3. Beta-Stage Error Surfacing (No Silent Failures)
- **Never swallow errors**: Every user-initiated action that fails MUST bubble up to the user as a visible toast with a "Report Bug" affordance.
- Banned Rust patterns: `let _ = <fallible>`, `.ok()`, `.unwrap_or_default()`, `let _ = <fallible>.await` on user operations.
- Banned TypeScript patterns: Empty `.catch(() => {})`, swallow `try-catch` blocks, or generic "An error occurred" toasts. Use `errorMessage(err)` for verbose surfacing.

### 4. Universal Internationalization (i18n)
- Houston ships in English (`en`), Spanish (`es`), and Portuguese (`pt`).
- **No literal English text in JSX**: All strings, labels, and aria-attributes must run through the `t()` function.
- Spanish = Latin-American neutral. Portuguese = Brazilian.
- Running `pnpm --filter houston-app check-locales` validates layout parity and blocks em-dashes (`—`) in copy.

---

## Local Git Verification (Husky & lint-staged)

We utilize machine-enforced git guardrails to prevent broken code, compilation errors, or version sync drifts from reaching origin.

When you run `git commit`, the Husky pre-commit hook automatically invokes `lint-staged` to execute:
- **TypeScript Workspace Typecheck**: runs `pnpm typecheck` (verifies entire workspace type safety).
- **Translation Parity Audit**: runs `check-locales` (verifies JSON structure matching).
- **Cargo Format Checks**: runs `rustfmt --check` on modified `.rs` files.
- **Workspace Release Sync**: runs `./scripts/cargo-sync-check.sh` on changes to `package.json` to verify that no version discrepancies exist between npm and cargo workspaces.

If any check fails, your commit will be blocked. To run checks manually:
```bash
# Verify typecheck, locales, cargo-sync-check, and Rust tests
make verify-all
```

---

## Conventional Commits

We strictly follow the [Conventional Commits](https://www.conventionalcommits.org/) specification. Commits must be formatted as:

```
<type>(<scope>): <short description>

[optional body]
```

### Approved Types:
- `feat`: A new user-facing feature.
- `fix`: A bug fix.
- `docs`: Documentation-only changes.
- `style`: Formatting, missing semi-colons, no code changes.
- `refactor`: A code change that neither fixes a bug nor adds a feature.
- `test`: Adding missing tests or correcting existing tests.
- `chore`: Updating build scripts, release workflows, or package dependencies.

---

## Pull Request & Issue Sync Policy

### GitHub-to-Linear Synchronization
Our core planning, issue tracking, and roadmap management are handled internally using **Linear**. 
- When a public issue is created on GitHub, our sync bots automatically mirror the report onto our internal Linear board.
- When an engineer claims the task or links a branch, status updates flow back to the GitHub issue transparently.
- When formatting an issue, please use our YAML Bug Report or Feature Request forms to guarantee our automation syncs it under the right priority tag.

### Contribution Pipeline
1. Find an open issue or submit a YAML proposal in GitHub.
2. Fork the repository and create an isolated branch from `main`: `git checkout -b feat/your-feature-name`.
3. Implement your changes keeping files <200 lines, fully type-safe, and i18n-compliant.
4. Verify your work using `make verify-all`.
5. Push your branch and open a Pull Request targeting `main`.
6. Ensure the automated GitHub Actions CI/CD check passes completely.
