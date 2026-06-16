import type { Capabilities } from "@houston/protocol";

/**
 * The two deployment capability profiles, in ONE place so the host, the local
 * sidecar entry, and the dual-profile parity gate all read the same source of
 * truth (no second copy to drift). `/v1/capabilities` serves one of these; the
 * UI gates affordances on these flags, never on a hardcoded "am I web/desktop".
 *
 * The asymmetries are deliberate and contained here (the irreducible local↔cloud
 * differences from the convergence plan): local has the Tauri shell + the user's
 * own machine (reveal-in-OS, terminal, unconfined bash, Anthropic OAuth); cloud
 * is the egress-locked remote sandbox, Codex-only. Everything NOT listed here is
 * shared behavior served by the same handlers — that's what `dual-profile.test.ts`
 * pins.
 */

/** What a desktop deployment can do — the Tauri shell handles OS-native bits. */
export const LOCAL_CAPABILITIES: Capabilities = {
  profile: "local",
  revealInOs: true,
  terminal: true,
  // Mobile pairing is gone — phones use the web app now (no tunnel/relay).
  tunnel: false,
  codeExecution: "local-bash",
  providers: ["anthropic", "openai-codex"],
};

/** What the cloud deployment can do (served at /v1/capabilities). */
export const CLOUD_CAPABILITIES: Capabilities = {
  profile: "cloud",
  revealInOs: false,
  terminal: false,
  tunnel: false,
  codeExecution: "remote-sandbox",
  providers: ["openai-codex"],
};
