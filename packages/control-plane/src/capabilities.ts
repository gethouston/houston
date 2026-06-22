import type { Capabilities } from "@houston/protocol";

/**
 * The two deployment capability profiles, in ONE place so the host, the local
 * sidecar entry, and the dual-profile parity gate all read the same source of
 * truth (no second copy to drift). `/v1/capabilities` serves one of these; the
 * UI gates affordances on these flags, never on a hardcoded "am I web/desktop".
 *
 * The asymmetries are deliberate and contained here (the irreducible local↔cloud
 * differences from the convergence plan): local has the Tauri shell + the user's
 * own machine (reveal-in-OS, terminal, unconfined bash, Anthropic OAuth, the
 * bring-your-own-key providers); cloud is the egress-locked remote sandbox,
 * Codex-only. Everything NOT listed here is shared behavior served by the same
 * handlers — that's what `dual-profile.test.ts` pins.
 *
 * API-key providers (openrouter, google) are LOCAL-only for now: the key is a
 * long-lived secret, and serving it into the egress-locked cloud sandbox per
 * turn is a Gate #2 question we have not signed off on. Desktop + self-host get
 * them today; cloud is a deliberate follow-up.
 */

/** What a desktop deployment can do — the Tauri shell handles OS-native bits. */
export const LOCAL_CAPABILITIES: Capabilities = {
  profile: "local",
  revealInOs: true,
  terminal: true,
  // Mobile pairing is gone — phones use the web app now (no tunnel/relay).
  tunnel: false,
  codeExecution: "local-bash",
  providers: ["anthropic", "openai-codex", "openrouter", "google"],
  // Composio ("for you" — each user's own free account) works in every
  // deployment; the same host code, gated on this flag, not a fork.
  integrations: ["composio"],
};

/** What the cloud deployment can do (served at /v1/capabilities). */
export const CLOUD_CAPABILITIES: Capabilities = {
  profile: "cloud",
  revealInOs: false,
  terminal: false,
  tunnel: false,
  codeExecution: "remote-sandbox",
  providers: ["openai-codex"],
  integrations: ["composio"],
};
