/**
 * Decide whether a given send should ask the engine to compact first.
 *
 * Centralized here (and called from `tauriChat.send`) so EVERY send path —
 * board chat, mission control, skill sends, retries — gets autocompact for
 * free, rather than each call site re-deriving the flag and one being missed.
 *
 * Reads the live feed store + the user's on/off setting synchronously (both
 * Zustand stores); the threshold is a build-time constant. New conversations
 * have no reported usage yet, so this returns `false` and the engine runs a
 * normal first turn.
 */
import { useFeedStore } from "../stores/feeds";
import { useAutocompactSettings } from "../stores/autocompact-settings";
import { getContextWindowConfig } from "./providers";
import {
  contextFillPercent,
  effectiveContextWindow,
  resolveThreshold,
  sessionContextUsage,
  shouldAutocompact,
} from "./context-usage";

/**
 * Percent-full at which a turn proactively compacts. A tuning constant, not a
 * user setting: defaults to 93, optionally overridden at build time via
 * `VITE_AUTOCOMPACT_THRESHOLD` (e.g. set it low to force compaction while
 * testing). Resolved once at module load.
 */
const AUTOCOMPACT_THRESHOLD = resolveThreshold(
  import.meta.env.VITE_AUTOCOMPACT_THRESHOLD,
);

export function shouldAutocompactForSession(
  agentPath: string,
  sessionKey: string,
  provider: string | undefined,
  model: string | undefined,
): boolean {
  const enabled = useAutocompactSettings.getState().enabled;
  if (!enabled) return false;

  const items = useFeedStore.getState().items[agentPath]?.[sessionKey];
  const { latest, peakContextTokens } = sessionContextUsage(items);
  const cfg = getContextWindowConfig(provider, model);
  const window = effectiveContextWindow(cfg, peakContextTokens);
  const percent = contextFillPercent(latest, window);

  return shouldAutocompact({
    percent,
    enabled,
    threshold: AUTOCOMPACT_THRESHOLD,
  });
}
