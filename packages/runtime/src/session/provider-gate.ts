import {
  activeProvider,
  type ProviderId,
  providerConfigured,
} from "../ai/providers";
import { anthropicCredentialSettled } from "../backends/claude/credential-status";

/**
 * The turn-time auth gate: may this turn be REFUSED as "nothing connected"?
 *
 * Every other provider answers from a stored credential, which is a file read —
 * synchronous and always settled. ANTHROPIC is the exception: its desktop
 * credential lives where only the `claude` binary can read it, so the signal is
 * a cached subprocess probe (backends/claude/credential-status.ts) that is
 * UNKNOWN until the first probe answers. Reading that unknown as "not
 * connected" refused an anthropic turn for the whole first-probe window and
 * dropped the user's prompt on the floor — the turn was never delivered and
 * never retried. So the gate awaits a settled answer and refuses only on one
 * that actually says logged-out; an unanswerable probe lets the turn run and
 * surface the provider's own typed error instead of a false reconnect card.
 */

const ANTHROPIC = "anthropic";

/**
 * Whether a turn's PINNED provider is definitively not connected. `false` for
 * an anthropic pin whose shared-dir signal has not settled yet (the await is
 * bounded by the probe's own timeout) or cannot settle at all.
 */
export async function pinnedProviderUnavailable(
  provider: ProviderId,
): Promise<boolean> {
  if (providerConfigured(provider)) return false;
  if (provider !== ANTHROPIC) return true;
  return (await anthropicCredentialSettled()) === false;
}

/**
 * The provider a turn can run on, or `null` when the agent's saved pick is
 * genuinely disconnected. Costs nothing beyond `activeProvider()` whenever a
 * provider resolves; only the refusal path waits for the anthropic signal to
 * settle, because that saved pick may BE anthropic on a cold cache.
 */
export async function connectedProviderForTurn(): Promise<ProviderId | null> {
  const provider = activeProvider();
  if (provider) return provider;
  await anthropicCredentialSettled();
  return activeProvider();
}
