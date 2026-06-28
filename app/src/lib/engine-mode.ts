/**
 * Whether this build talks to the v3 Houston host (host mode) instead
 * of the Tauri-spawned Rust engine.
 *
 * This MUST mirror `useHost` in `app/vite.config.ts`, which aliases
 * `@houston-ai/engine-client` to the host adapter exactly when one of
 * these flags is set. The adapter decides its protocol (v3 host vs the
 * Rust wire) from `window.__HOUSTON_CP__` at HoustonClient *construction* time,
 * so the flag has to be a deterministic build constant set before any client is
 * built — NOT a value injected by the Tauri host handshake, which can lose the
 * race against the `get_engine_handshake` poll / `houston-engine-ready` event
 * and leave a Rust-wire client pointed at a v3 host. See HOU-546.
 */
export function controlPlaneBuild(env: {
  VITE_NEW_ENGINE_URL?: string;
  VITE_NEW_ENGINE?: string;
}): boolean {
  return (
    Boolean(env.VITE_NEW_ENGINE_URL) ||
    env.VITE_NEW_ENGINE === "1" ||
    env.VITE_NEW_ENGINE === "true"
  );
}
