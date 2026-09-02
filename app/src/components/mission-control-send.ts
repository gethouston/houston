/**
 * Pure activity-override resolution for a Mission Control follow-up send.
 *
 * Mission Control is cross-agent: an existing activity's stored provider+model
 * is the per-activity override and is often different from the agent's default
 * (e.g. agent default is GPT-5.5 but the activity was created with Opus). The
 * engine's session router never reads activity records — it falls back to the
 * agent's `config.json` when no override is passed. So the frontend must look
 * up the activity and forward its provider+model on every send; otherwise the
 * picker shows one model while the wire ships another, surfacing as a silent
 * model swap when both CLIs are installed, or as `Failed to spawn <cli>:
 * program not found` when they aren't.
 *
 * Kept pure (no React, no Tauri, no async) so the lookup + legacy-alias
 * normalization is unit-testable and shared with whatever Mission Control's
 * future send paths grow into.
 */
// Explicit `.ts` extension so this module is also resolvable when loaded
// directly by `node --test --experimental-strip-types` (Node ESM requires
// the extension for runtime-value imports). Vite/TSC accept it because
// `allowImportingTsExtensions: true` is set in `app/tsconfig.json`.
import { normalizeLegacyModel } from "../lib/providers.ts";
import { DEFAULT_TURN_MODE } from "../lib/turn-mode.ts";

/** Minimal shape needed for override resolution; mirrors `ActivityItem`. */
export interface ActivityOverrideSource {
  id: string;
  session_key?: string;
  provider?: string;
  model?: string;
}

/** Override pair passed to `tauriChat.send`. */
export interface SendOverrides {
  providerOverride?: string;
  modelOverride?: string;
  /** Turn mode pin for user-typed sends; absent = execute. */
  modeOverride?: "execute" | "plan" | "auto";
}

/**
 * Look the activity up by the id encoded in `sessionKey` and project its
 * stored provider/model as the engine override pair. Legacy CLI aliases
 * (`"opus"`/`"sonnet"`) are normalized to their explicit version IDs so the
 * frontend mirrors the engine's `migrate_config_model_aliases` map for any
 * activity record that predates the version-pinning catalog.
 *
 * Returns an empty object when the activity is not found (e.g. it was deleted
 * between render and send); the engine then falls back to the agent config,
 * which is the only sane default with no override information available.
 */
export function resolveActivityOverride(
  sessionKey: string,
  activities: ActivityOverrideSource[] | undefined,
): SendOverrides {
  const activityId = sessionKey.replace(/^activity-/, "");
  const activity = activities?.find((a) => {
    if (a.session_key && a.session_key === sessionKey) return true;
    return sessionKey.startsWith("activity-") && a.id === activityId;
  });
  if (!activity) return {};
  return {
    providerOverride: activity.provider,
    modelOverride: normalizeLegacyModel(activity.model ?? null) ?? undefined,
  };
}

/** Assemble a Mission Control follow-up's provider/model and session mode pins. */
export function resolveMissionControlSendOverrides(
  sessionKey: string,
  activities: ActivityOverrideSource[] | undefined,
): SendOverrides {
  return {
    ...resolveActivityOverride(sessionKey, activities),
    modeOverride: DEFAULT_TURN_MODE,
  };
}

/**
 * The follow-up's pin WITHOUT a pod round trip (PRODUCT-1643). Against an
 * asleep pod the activity read used to ride the whole cold start before the
 * turn stream could show the user's bubble, so the composer froze for seconds
 * after Enter. The list is already in the query cache whenever the chat panel
 * has been open a beat (it mounts the same query), so:
 *
 *  - cached and the row is found -> the row's own pin, exactly as before;
 *  - otherwise -> the composer's effective pick, which the chat panel derives
 *    from that same row when loaded and from the agent default until then —
 *    so picker and wire still agree, and nothing awaits the pod.
 */
export function resolveFollowUpOverrides(
  sessionKey: string,
  cachedActivities: ActivityOverrideSource[] | undefined,
  composer: SendOverrides,
): SendOverrides {
  const fromRow = resolveActivityOverride(sessionKey, cachedActivities);
  if (fromRow.providerOverride === undefined) {
    return { ...composer, modeOverride: DEFAULT_TURN_MODE };
  }
  return { ...fromRow, modeOverride: DEFAULT_TURN_MODE };
}
