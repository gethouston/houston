import { isPersonalScope } from "./acting-context";
import type { TurnPin } from "./exec-turn";
import { connectedProviderForTurn } from "./provider-gate";
import type { ResumeRequest } from "./resume-request";
import { ensureProviderForTurn } from "./turn-start";

export interface ResumeProviderProbes {
  ensureProvider?: (pin: TurnPin | undefined) => Promise<string | null>;
  connectedProvider?: () => Promise<string | null>;
  providerRetries?: number;
  providerRetryMs?: number;
}

export const RESUME_PROVIDER_RETRIES = 6;
export const RESUME_PROVIDER_RETRY_MS = 5_000;

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
    const connectedNow = await probe();
    if (request.pin?.provider || connectedNow) return true;
    if (attempt >= retries) return false;
    await sleep(retryMs);
  }
}
