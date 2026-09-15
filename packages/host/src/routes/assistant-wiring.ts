import type { AssistantGateway } from "./assistant-forward";

/**
 * WHERE this deployment performs user-facing Houston operations — resolved in
 * ONE place, for the HOST alone: its runtime-facing dispatcher
 * (`routes/assistant-sandbox.ts`) and the boot line that names the state. The
 * gateway credential stops here. No runtime this host spawns is ever told the
 * URL or the token: a runtime reaches Houston operations through
 * `/sandbox/assistant/call` with its own per-agent sandbox token, and the host
 * forwards with the credential resolved below.
 *
 * Two shapes, one rule — the credential IS the switch:
 *  - GATEWAY-FRONTED (a managed cloud pod): the gateway stamps
 *    HOUSTON_ASSISTANT_CP_URL + HOUSTON_ASSISTANT_TOKEN into the pod. The
 *    gateway performs the operations; the pod only relays.
 *  - DESKTOP / SELF-HOST: nothing fronts this host, and it serves the very
 *    routes the operation catalog names — so it is its own gateway. The caller
 *    passes `self` (this host's own loopback base URL and the per-boot bearer
 *    it already accepts) and the family is on with nothing for the user to
 *    configure.
 *
 * An explicitly configured env pair always wins: an operator who pointed this
 * host at a real gateway meant it.
 */

export const ASSISTANT_CP_URL_ENV = "HOUSTON_ASSISTANT_CP_URL";
export const ASSISTANT_TOKEN_ENV = "HOUSTON_ASSISTANT_TOKEN";

export interface AssistantWiring {
  /** Defaults to `process.env`. */
  env?: NodeJS.ProcessEnv;
  /**
   * This host's own coordinates, set ONLY when it can act as its own gateway:
   * not gateway-fronted, so the routes the catalog describes are its own and
   * its per-boot token is the credential that drives them. Omitted on a fronted
   * pod, whose routes answer for one agent and whose token authorizes nothing
   * account-wide.
   */
  self?: AssistantGateway;
  /**
   * True on a managed cloud pod. The env pair the gateway stamps is the usual
   * proof of it, but it is not the FACT — a rollout that dropped the variables
   * leaves a pod that is still fronted — so the deployment's own answer is
   * carried rather than inferred (`local/host-base.ts` passes what it knows).
   */
  gatewayFronted?: boolean;
}

/** Strip a trailing slash so a route path never doubles up on the join. */
const normalize = (gateway: AssistantGateway): AssistantGateway => ({
  url: gateway.url.replace(/\/+$/, ""),
  token: gateway.token,
});

/** The configured gateway, or null when either half of the pair is missing. */
function envAssistantGateway(env: NodeJS.ProcessEnv): AssistantGateway | null {
  const url = env[ASSISTANT_CP_URL_ENV]?.trim();
  const token = env[ASSISTANT_TOKEN_ENV]?.trim();
  return url && token ? normalize({ url, token }) : null;
}

/**
 * The single source of truth: the configured env pair when set, else this
 * host itself when nothing fronts it, else nothing (the dispatcher answers
 * 501 and says which env would turn it on).
 */
export function resolveAssistantGateway(
  wiring: AssistantWiring = {},
): AssistantGateway | null {
  const configured = envAssistantGateway(wiring.env ?? process.env);
  if (configured) return configured;
  return wiring.self ? normalize(wiring.self) : null;
}

/**
 * True when THIS host performs the catalogued operations itself: nothing fronts
 * it and no gateway pair is configured, so the routes the catalog names are its
 * own.
 *
 * Which is exactly when its route table is the honest answer to "what can this
 * deployment do" (`assistant/served-operations.ts`). Behind a real gateway the
 * question belongs to the gateway, which serves the whole surface, and a pod
 * that guessed from its OWN routes would withdraw three quarters of the
 * catalog from a managed assistant that can perform every bit of it.
 *
 * Being fronted disqualifies a pod on its own, without the env pair: the pair
 * is how a fronted pod is CONFIGURED, and a pod whose gateway stamped nothing
 * is still one agent's routes rather than the catalogued surface.
 */
export function assistantOperationsServedHere(
  wiring: AssistantWiring = {},
): boolean {
  if (wiring.gatewayFronted) return false;
  return envAssistantGateway(wiring.env ?? process.env) === null;
}

/** The one boot line naming the state, and the remedy when it is off. */
export function formatAssistantModeLog(wiring: AssistantWiring = {}): string {
  const env = wiring.env ?? process.env;
  const configured = envAssistantGateway(env);
  if (configured) {
    return `[local-host] assistant operations: gateway ${configured.url}`;
  }
  if (wiring.self) {
    return `[local-host] assistant operations: this host (${normalize(wiring.self).url})`;
  }
  const missing = [
    env[ASSISTANT_CP_URL_ENV]?.trim() ? null : ASSISTANT_CP_URL_ENV,
    env[ASSISTANT_TOKEN_ENV]?.trim() ? null : ASSISTANT_TOKEN_ENV,
  ].filter((name): name is string => name !== null);
  return `[local-host] assistant operations off: set ${missing.join(" and ")} to enable`;
}
