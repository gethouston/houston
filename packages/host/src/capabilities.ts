// `getProviders` is pi-ai's legacy static-catalog read, preserved verbatim on
// the `/compat` entrypoint (the new `Models`/`Provider` collection API needs an
// instantiated registry we don't otherwise carry here).
import { getProviders } from "@earendil-works/pi-ai/compat";
import type { Capabilities } from "@houston/protocol";

/**
 * The two deployment capability profiles, in ONE place so the host, the local
 * sidecar entry, and the dual-profile parity gate all read the same source of
 * truth (no second copy to drift). `/v1/capabilities` serves one of these; the
 * UI gates affordances on these flags, never on a hardcoded "am I web/desktop".
 *
 * The asymmetries are deliberate and contained here (the irreducible local↔cloud
 * differences from the convergence plan): local has the Tauri shell + the user's
 * own machine (reveal-in-OS, terminal). Every profile offers the SAME connect-once
 * / API-key providers AND the OpenAI-compatible (bring-your-own endpoint) provider
 * (`openaiCompatible`): a cloud pod now accepts a public HTTPS endpoint the user
 * hosts (a tunnel or a directly hosted server), so it is no longer desktop-only —
 * the old "cloud can't reach the user's localhost" rationale is superseded. What
 * differs is validation, not availability: a managed cloud pod egresses ONLY to
 * public TCP 443, so it validates the base URL at save time (custom-endpoint
 * validation in routes/agents.ts) while desktop/self-host keep accepting
 * localhost. Everything NOT listed here is shared behavior served by the same
 * handlers — that's what `dual-profile.test.ts` pins.
 */

/**
 * Every model provider Houston serves, as a capabilities HINT. Derived from
 * pi-ai's baked provider registry (sorted for a stable order) so it CANNOT drift
 * from the real runnable set — the authoritative list is `GET /v1/catalog`
 * (`providers/pi-catalog.ts`), which enumerates the same registry. Shared by all
 * profiles: the managed cloud pod runs the same host/runtime as desktop and its
 * egress reaches every provider, so cloud and desktop offer the identical set.
 * The OpenAI-compatible (BYO endpoint) provider is NOT here — it is a Houston
 * concept, not a pi-ai provider, and rides the separate `openaiCompatible` flag
 * because it carries a base URL + model, not a credential.
 */
const HOSTED_PROVIDERS: readonly string[] = [...getProviders()].sort();

/** What a desktop deployment can do — the Tauri shell handles OS-native bits. */
export const LOCAL_CAPABILITIES: Capabilities = {
  profile: "local",
  revealInOs: true,
  terminal: true,
  // Mobile pairing is gone — phones use the web app now (no tunnel/relay).
  tunnel: false,
  codeExecution: "local-bash",
  providers: [...HOSTED_PROVIDERS],
  // The user's own machine can reach a local LLM server (Ollama/vLLM/LM Studio);
  // desktop accepts any http(s) base URL, including localhost (no cloud egress
  // limits apply here).
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
  providers: [...HOSTED_PROVIDERS],
  // BYO OpenAI-compatible endpoint, hosted on public HTTPS (tunnel or directly
  // hosted). The save route validates it reaches only a public :443 host.
  openaiCompatible: true,
  integrations: ["composio"],
};

/**
 * Managed personal cloud pod: open local-profile host/runtime in Kubernetes,
 * fronted by the private gateway. The pod has no OS-native affordances, but the
 * agent's bash runs in-container (HOU-669): the pod is single-tenant and
 * network-policied, so the container is the sandbox — same posture as
 * self-host. Only the OS-native bits (reveal, terminal, local LLM) are cut.
 */
export const MANAGED_CLOUD_CAPABILITIES: Capabilities = {
  profile: "cloud",
  revealInOs: false,
  terminal: false,
  tunnel: false,
  codeExecution: "local-bash",
  providers: [...HOSTED_PROVIDERS],
  // Same as the cloud profile: a public-HTTPS BYO endpoint, validated on save.
  openaiCompatible: true,
  integrations: ["composio"],
};
