import type { TurnPin } from "../ports";
import {
  isCloudProvider,
  isTurnServable,
  OPENAI_COMPATIBLE,
} from "../providers";
import {
  customEndpointKey,
  PROVIDER,
  readSettings,
  type TurnDeps,
} from "./deps";

/**
 * Resolving which provider a cloud per-turn dispatch runs on — the seam that must
 * NEVER silently substitute one provider for another (a swap means the wrong
 * model AND the wrong cost accounting). openai-compatible is the tricky case: the
 * catalog keeps it `cloud: false` so it stays out of the curated model picker, so
 * its per-turn eligibility is decided here by whether an endpoint is configured.
 */

/** Loud error: openai-compatible is the effective active pick with no endpoint. */
const NO_ENDPOINT_ACTIVE =
  "No local endpoint configured for this agent — set a base URL and model for the OpenAI-compatible provider before starting a turn.";
/** Loud error: a routine pins openai-compatible but the agent has no endpoint. */
const NO_ENDPOINT_PINNED =
  "This routine pins the OpenAI-compatible provider, but no endpoint is configured for this agent — connect one before it can run.";

/**
 * True when a base URL + model are persisted for this prefix (NOT merely that a
 * key exists) — the same "configured" test the runtime's `customEndpointConfigured`
 * applies, read from the agent's object-storage prefix the next turn hydrates.
 */
export async function hasCustomEndpoint(
  deps: TurnDeps,
  prefix: string,
): Promise<boolean> {
  const raw = await deps.vfs.readText(customEndpointKey(prefix));
  if (!raw) return false;
  try {
    const e = JSON.parse(raw) as { baseUrl?: string; model?: string };
    return !!(e.baseUrl && e.model);
  } catch {
    return false;
  }
}

/**
 * The provider (+ effort) a cloud turn runs on. Precedence: a routine's pinned
 * provider wins, else the agent's saved active provider, else Codex (the cloud
 * default). NO path silently swaps providers:
 *  - a pinned provider the runtime can't serve throws VISIBLY (the firer marks
 *    the run errored) — never a fallback to Codex carrying the pinned MODEL;
 *  - a saved openai-compatible with no endpoint throws loudly — run on the user's
 *    endpoint or fail with the real reason, never Codex;
 *  - only a STALE non-cloud saved pick (e.g. anthropic, off in cloud on ToS)
 *    falls back to Codex.
 * Resolved BEFORE the quota/relay slot is claimed, so a bad pick leaks no slot.
 */
export async function resolveCloudTurn(
  deps: TurnDeps,
  prefix: string,
  pin: TurnPin | undefined,
): Promise<{ provider: string; effort?: string }> {
  // Pin guard first — pure for every provider EXCEPT openai-compatible (which
  // needs the endpoint lookup), so an unservable pin like anthropic is rejected
  // without touching a single dependency (the `&&` short-circuits the vfs read).
  if (pin?.provider) {
    const endpointReady =
      pin.provider === OPENAI_COMPATIBLE &&
      (await hasCustomEndpoint(deps, prefix));
    if (!isTurnServable(pin.provider, endpointReady))
      throw new Error(
        pin.provider === OPENAI_COMPATIBLE
          ? NO_ENDPOINT_PINNED
          : `${pin.provider} is not available for cloud agents — edit the routine to pick another provider`,
      );
  }
  const settings = await readSettings(deps, prefix);
  const effort = pin?.effort ?? settings.effort;
  // A validated pin wins over the saved pick (per-turn only — settings untouched).
  if (pin?.provider) return { provider: pin.provider, effort };

  const saved = settings.activeProvider;
  if (saved === OPENAI_COMPATIBLE) {
    if (!(await hasCustomEndpoint(deps, prefix)))
      throw new Error(NO_ENDPOINT_ACTIVE);
    return { provider: saved, effort };
  }
  return {
    provider: saved && isCloudProvider(saved) ? saved : PROVIDER,
    effort,
  };
}
