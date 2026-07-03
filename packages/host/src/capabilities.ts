import type { Capabilities } from "@houston/protocol";

/**
 * The two deployment capability profiles, in ONE place so the host, the local
 * sidecar entry, and the dual-profile parity gate all read the same source of
 * truth (no second copy to drift). `/v1/capabilities` serves one of these; the
 * UI gates affordances on these flags, never on a hardcoded "am I web/desktop".
 *
 * The asymmetries are deliberate and contained here (the irreducible local↔cloud
 * differences from the convergence plan): local has the Tauri shell + the user's
 * own machine (reveal-in-OS, terminal, unconfined bash, a reachable local LLM);
 * cloud is the egress-locked remote sandbox or the clamped managed pod. Cloud
 * offers the SAME connect-once / API-key providers as desktop — only the user's
 * own local LLM (the `openaiCompatible` flag) is desktop-only, because a cloud
 * runtime can't reach a server on the user's machine. Everything NOT listed here
 * is shared behavior served by the same handlers — that's what
 * `dual-profile.test.ts` pins.
 */

/**
 * Every connect-once / API-key provider Houston serves. Shared by all profiles:
 * cloud deployments offer the exact same model providers as desktop. The local
 * LLM is NOT in this list — it rides the separate `openaiCompatible` flag, which
 * only the local profile sets, since it needs a server on the user's own machine.
 */
const HOSTED_PROVIDERS: readonly string[] = [
  "anthropic",
  "openai-codex",
  "github-copilot",
  "opencode",
  "opencode-go",
  "openrouter",
  "google",
  "amazon-bedrock",
];

/** What a desktop deployment can do — the Tauri shell handles OS-native bits. */
export const LOCAL_CAPABILITIES: Capabilities = {
  profile: "local",
  revealInOs: true,
  terminal: true,
  // Mobile pairing is gone — phones use the web app now (no tunnel/relay).
  tunnel: false,
  codeExecution: "local-bash",
  providers: [...HOSTED_PROVIDERS],
  // The user's own machine can reach a local LLM server (Ollama/vLLM/LM Studio).
  openaiCompatible: true,
  // Composio (platform model) works in every deployment; the same host code,
  // gated on this flag, not a fork. This is the NOMINAL list — each wiring
  // point overrides it with the providers actually configured (desktop needs
  // the gateway URL, cloud/self-host the platform key), so an unconfigured
  // deployment honestly serves [].
  integrations: ["composio"],
};

/** What the cloud deployment can do (served at /v1/capabilities). */
export const CLOUD_CAPABILITIES: Capabilities = {
  profile: "cloud",
  revealInOs: false,
  terminal: false,
  tunnel: false,
  codeExecution: "remote-sandbox",
  // Same model providers as desktop; only the user's local LLM is dropped.
  providers: [...HOSTED_PROVIDERS],
  // A cloud runtime can't reach a server on the user's own machine.
  openaiCompatible: false,
  integrations: ["composio"],
};

/**
 * Managed personal cloud pod: open local-profile host/runtime in Kubernetes,
 * fronted by the private gateway. The pod has no OS-native affordances and no
 * process code execution; tools are clamped file + integrations only. It still
 * offers the full provider set — only code execution and OS-native bits are cut.
 */
export const MANAGED_CLOUD_CAPABILITIES: Capabilities = {
  profile: "cloud",
  revealInOs: false,
  terminal: false,
  tunnel: false,
  codeExecution: "disabled",
  providers: [...HOSTED_PROVIDERS],
  openaiCompatible: false,
  integrations: ["composio"],
};
