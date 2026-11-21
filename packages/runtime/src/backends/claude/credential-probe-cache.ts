import { type ProbeAnswer, spawnStatusProbe } from "./auth-cli";

export type CredentialProbe = () => Promise<ProbeAnswer>;

let cache: boolean | undefined;

let lastProbeAt = 0;

let unknownBackoffUntil = 0;

let inFlight: Promise<boolean> | null = null;

const TTL_CONNECTED_MS = 30_000;
const TTL_DISCONNECTED_MS = 2_000;

const UNKNOWN_BACKOFF_MS = 15_000;

export function readCredentialCache(): boolean | undefined {
  return cache;
}

export async function refreshAnthropicCredential(
  probe: CredentialProbe = spawnStatusProbe,
  opts: { force?: boolean } = {},
): Promise<boolean> {
  const now = Date.now();
  if (!opts.force) {
    if (now < unknownBackoffUntil) return cache ?? false;
    const ttl = cache === true ? TTL_CONNECTED_MS : TTL_DISCONNECTED_MS;
    if (cache !== undefined && now - lastProbeAt < ttl) return cache;
  }
  if (inFlight) return inFlight;
  inFlight = (async () => {
    let answer: ProbeAnswer;
    try {
      answer = await probe();
    } catch (err) {
      answer = {
        known: false,
        reason: err instanceof Error ? err.message : String(err),
      };
    }
    if (answer.known) {
      cache = answer.loggedIn;
      unknownBackoffUntil = 0;
      lastProbeAt = Date.now();
    } else {
      unknownBackoffUntil = Date.now() + UNKNOWN_BACKOFF_MS;
      console.warn(
        `[claude] could not read anthropic credential status (${answer.reason}); keeping the last known answer (${cache ?? false})`,
      );
    }
    return cache ?? false;
  })();
  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

export function resetAnthropicCredentialCache(value = false): void {
  cache = value;
  lastProbeAt = 0;
  unknownBackoffUntil = 0;
  inFlight = null;
}

export function forgetAnthropicCredentialCacheForTest(): void {
  resetAnthropicCredentialCache();
  cache = undefined;
}
