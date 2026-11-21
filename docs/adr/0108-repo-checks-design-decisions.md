# Repo checks: design decisions

Covers the repo-wide gates: `scripts/check-*.mjs`, `scripts/lib/app-sources.mjs`, `scripts/parity/` and the locale gates in `app/scripts/`.

## Boundary check (`scripts/check-boundaries.mjs`)

The closed multi-tenant control plane (`@houston/host-cloud`) was retired and deleted; the shipped cloud is a private gateway plus one engine pod per agent running this repo's open host and runtime. `BOUNDARY.md` is the manifest; the constants at the top of the script must stay in sync with it.

Open packages are enumerated dynamically from `packages/*` (mirroring the pnpm workspace glob) plus `ui`, so a brand-new package is covered immediately; a fixed list would let cloud code reappear under a new name. The retired path is excluded and owned by Rule B.

Rule A: no open-package file may reach the closed package or a cloud lib, by (a) the bare `@houston/host-cloud` specifier, (b) a relative or absolute import resolving under the former `packages/host-cloud/` path (pure string resolution, so `../../host-cloud/...` is caught though the directory is gone), (c) the `CLOUD_LIBS` denylist (trailing-slash entries match a scope; `postgres` is postgres.js, distinct from `pg`), or (d) any bare import that is not a builtin and not a declared dependency of the importing file's own `package.json`. The denylist only gives precise messages; (d) plus Rule C are the load-bearing guarantee, catching cloud dependencies the denylist has never heard of. Repo scopes (`@houston/`, `@houston-ai/`) are exempt from (d) because `packages/web` mirrors `app/src` through a vite alias and test harnesses self-import; `@houston/host-cloud` is still caught by (a) first.

The one exception is the runtime's GcsStore adapter (`packages/runtime/src/turn/gcs-store.ts`) and its wiring point (`packages/runtime/src/main.ts`, dynamic `import()`), which may import `@google-cloud/storage` (`RUNTIME_CLOUD_ALLOWLIST`, `MANIFEST_CLOUD_ALLOW`). Test scaffolding named `*-harness`, `*.test-helper`, `*.fixture` or `*.mock` is treated like a test file, as documented in BOUNDARY.md.

Rule B: `packages/host-cloud/` must not exist; reappearing content would re-publish closed code. Gitignored leftovers (`node_modules/`, `dist/`) are tolerated because pnpm installed them there on every pre-retirement checkout and a branch switch removes only tracked files.

Rule C: no open package may declare the closed package or a cloud lib in any dependency bucket. A dependency must be declared to resolve, and a declaration is a small reviewable surface, so this is the allowlist direction the seam needs.

Rule D: only `app/src/lib/tauri.ts` (the error-surfacing policy layer: Sentry grouping label, per-call toast options, expected-state ladder) and the facade files that use the same `engineCall` policy (`theme-facade.ts`, `conversation-import-facade.ts`, `agents-facade.ts`, in `ENGINE_CLIENT_OWNERS`) may call `getEngine()` freely. Every other caller is frozen in `ENGINE_CALL_BYPASS`, may only shrink, and a listed file that stopped calling must be removed. Rule D counts on raw source, comments included: a `getEngine()` in a comment still tells a reader the file talks to the engine, and a commented-out call is one paste from live. It runs only when `app/src` exists, because the boundary test fixture is packages-only.

Import extraction is a regex over comment-stripped source (`stripComments`), respecting string and template literals. String-literal content spans are tracked so a keyword inside a string (a test title ending in `from`) is not read as an import. No npm dependencies.

## Desktop native boundary (`scripts/check-desktop-native.mjs`)

`app/src/lib/desktop-native-commands.ts` declares the only capabilities the frontend may reach outside `@houston/sdk` (properties of the user's machine). Five fatal assertions keep the declaration, the only caller (`app/src/lib/os-bridge/`), the only implementer (`generate_handler!` in `app/src-tauri/src/lib.rs`) and the web shim (`packages/web/src/shims/tauri-core.ts`) in agreement, plus the `@tauri-apps/*` aliases in `packages/web`'s vite config and tsconfig.

The bridge prefix includes a trailing separator so it does not also excuse `app/src/lib/os-bridge.ts`, the barrel that must never invoke anything.

The declared surface is parsed, not imported, because the script runs under plain node from `pnpm check` and from packages/web's typecheck without a TypeScript loader. A parse that dropped entries would fail assertion 1 immediately.

`lib.rs` is read one `module::path::command,` per line; anything else in the block is ignored. A quote-aware comment strip is the wrong tool for Rust because of lifetimes and char literals.

Three identity-session commands are exempt from shimming by name (browser storage is forced on web and the shim's default guard covers them), never by category, so recategorising a command cannot quietly excuse it.

The shim check reads `case` labels of its `switch (cmd)`, not file text, so a command named in a comment or error copy does not count as handled.

The only-caller check covers both `invoke(` calls and `invoke` imports, because `import { invoke as run }` would make the call spelling arbitrary.

## Comment blanking for app source checks (`scripts/lib/app-sources.mjs`)

Boundary checks that grep `app/src` blank comments first (keeping newlines so matches stay on their lines), because prose explaining a boundary (for example `invoke("report_bug")` in a doc comment) would otherwise be reported as a violation of it. The stripper treats every `'` as a string quote and is TypeScript-only; it must not be pointed at Rust. Tests are not shipped and are skipped.

## Cross-surface parity (`scripts/check-parity.mjs`, `scripts/parity/`)

Validates `design/inventory/inventory.yaml`, `CHANGELOG.md` and `manifests/*.yaml` (contract in `design/inventory/README.md`). Unknown keys and mistyped statuses fail rather than pass silently, because an ignored field lets the contract rot. A manifest may only reference inventory components, must list every component, may not claim an `inventoryVersion` beyond the inventory's, and an enforced surface may not leave any component with `since <= N` not started. A version bump needs a matching `## vN` changelog heading. Loaders never throw (problems become violation strings) so one run reports everything, and `checkParity(dir)` is exported so tests run against fixtures without shelling out. Manifests are loaded sorted by filename and the filename base is the expected `surface`.

## Locale gates (`app/scripts/check-locales.mjs`, `app/scripts/check-locale-usage.mjs`)

Parity compares every non-English locale against English (missing, extra or type-mismatched keys, `{{var}}` placeholder parity) and bans em dashes in all locales, English included. Usage walks `app/src` and fails on a literal `t("...")` key no locale defines; parity alone missed keys that were in sync by being absent from all three locales and rendered their raw key to users. A `ns:key` names its namespace; a bare key belongs to the file's first `useTranslation(...)` namespace (i18next's default for that hook). Files with no namespace, computed keys and unregistered namespaces are skipped rather than guessed. A key resolves to a string, an object (`returnObjects`) or a plural family. Both halves read locales through one loader passed in.
