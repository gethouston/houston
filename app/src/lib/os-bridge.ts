/**
 * OS-native Tauri IPC bridge — the barrel every caller imports.
 *
 * `app/src/lib/os-bridge/` is the ONLY place in `app/src/` that may call
 * `invoke(...)`. Two classes of calls live there:
 *
 *  1. **OS-native helpers** (`osRevealFile`, `osOpenUrl`, …). These
 *     probe the user's local machine (file manager, open URL, terminal, local
 *     Claude CLI, local log writes) and will NEVER move to the engine —
 *     the engine may run on a remote VPS.
 *
 *  2. **Local Tauri events** (`legacyListen`, `legacyEmit`). Used by
 *     `events.ts` for events that never leave the desktop process —
 *     e.g. `app-activated` (OS window resume).
 *
 * One module per machine-local category of `desktop-native-commands.ts`, so the
 * boundary reads as the list of capabilities it allows. Callers import from
 * `os-bridge`, never from a category module, so re-categorising a wrapper is
 * not a repo-wide rename. `os-bridge/invoke.ts` stays private on purpose.
 *
 * Both halves of the boundary are enforced by `scripts/check-desktop-native.mjs`
 * (root `pnpm check`): no file outside `app/src/lib/os-bridge/` may contain
 * `invoke(`, and every command wrapped there must be declared in
 * `desktop-native-commands.ts`, registered in the Rust `generate_handler!`
 * block, and answered by the web shim.
 */

export * from "./os-bridge/diagnostics.ts";
export * from "./os-bridge/dictation.ts";
export * from "./os-bridge/keychain.ts";
export * from "./os-bridge/local-bridge.ts";
export * from "./os-bridge/migration.ts";
export * from "./os-bridge/oauth-loopback.ts";
export * from "./os-bridge/os.ts";
export * from "./os-bridge/platform.ts";
export * from "./os-bridge/updater.ts";
