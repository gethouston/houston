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

/** Minimal shape needed for override resolution; mirrors `ActivityItem`. */
export interface ActivityOverrideSource {
  id: string;
  provider?: string;
  model?: string;
}

/** Override pair passed to `tauriChat.send`. */
export interface SendOverrides {
  providerOverride?: string;
  modelOverride?: string;
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
  const activity = activities?.find((a) => a.id === activityId);
  if (!activity) return {};
  return {
    providerOverride: activity.provider,
    modelOverride: normalizeLegacyModel(activity.model ?? null) ?? undefined,
  };
}
