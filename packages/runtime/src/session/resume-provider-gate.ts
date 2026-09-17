import { isPersonalScope } from "./acting-context";
import type { TurnPin } from "./exec-turn";
import { connectedProviderForTurn } from "./provider-gate";
import type { ResumeRequest } from "./resume-request";
import { ensureProviderForTurn } from "./turn-start";

/** The provider probes a boot resume runs on; production wires the real ones. */
export interface ResumeProviderProbes {
  ensureProvider?: (pin: TurnPin | undefined) => Promise<string | null>;
  connectedProvider?: () => Promise<string | null>;
  providerRetries?: number;
  providerRetryMs?: number;
}

/**
 * The HTTP route refuses a turn while nothing is connected; a resume has no
 * client to refuse to, so it waits instead. The served credential lands with
 * the boot's serve sync, usually inside the first delay; a slow gateway gets
 * this many more looks before the resume is dropped with a log line.
 */
export const RESUME_PROVIDER_RETRIES = 6;
export const RESUME_PROVIDER_RETRY_MS = 5_000;

/**
 * Whether the turn can start: a pinned provider runs on its own gate inside
 * runTurn (the route treats it the same), anything else needs the agent's
 * connected provider, which the serve sync may still be delivering.
 *
 * WHICH probe depends on the credential scope. The team scope syncs
 * (`ensureProviderForTurn`), because that sync fetches the team credential
 * into the team path — exactly what the resume will run on. A per-user scope
 * must NEVER sync: the serve probe sends `x-houston-acting-as` only when a
 * live acting-as token is present, and the resume has none (the token died
 * with the process), so the gateway would answer with the TEAM credential and
 * the sync would write it into the MEMBER's own auth file. That is the wrong
 * account billed and a poisoned credential file. The member's credential
 * either survived on disk (resume-request.ts checks) or the resume is dropped.
 */
export async function resumeProviderReady(
  request: ResumeRequest,
  probes: ResumeProviderProbes,
  sleep: (ms: number) => Promise<void>,
): Promise<boolean> {
  const scope = request.acting?.credentialScopeKey;
  const personal = scope !== undefined && isPersonalScope(scope);
  const connected = probes.connectedProvider ?? connectedProviderForTurn;
  const ensure = probes.ensureProvider ?? ensureProviderForTurn;
  const probe = personal ? () => connected() : () => ensure(request.pin);
  const retries = probes.providerRetries ?? RESUME_PROVIDER_RETRIES;
  const retryMs = probes.providerRetryMs ?? RESUME_PROVIDER_RETRY_MS;
  for (let attempt = 0; ; attempt++) {
    // Probed even for a pinned turn on the team scope: that probe is also the
    // credential sync the pinned provider runs on.
    const connectedNow = await probe();
    if (request.pin?.provider || connectedNow) return true;
    if (attempt >= retries) return false;
    await sleep(retryMs);
  }
}
