import { toDisplayProviderIdOrNull } from "../lib/provider-overrides.ts";
import {
  normalizeLegacyModel,
  validEffortOrDefault,
} from "../lib/providers.ts";
import { DEFAULT_TURN_MODE } from "../lib/turn-mode.ts";

export interface ActivityOverrideSource {
  id: string;
  session_key?: string;
  provider?: string;
  model?: string;
}

export interface SendOverrides {
  providerOverride?: string;
  modelOverride?: string;
  effortOverride?: string;
  modeOverride?: "execute" | "plan" | "auto";
}

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
    providerOverride: toDisplayProviderIdOrNull(activity.provider) ?? undefined,
    modelOverride:
      normalizeLegacyModel(activity.model ?? null, activity.provider) ??
      undefined,
  };
}

export function resolveMissionControlSendOverrides(
  sessionKey: string,
  activities: ActivityOverrideSource[] | undefined,
): SendOverrides {
  return {
    ...resolveActivityOverride(sessionKey, activities),
    modeOverride: DEFAULT_TURN_MODE,
  };
}

export function resolveFollowUpOverrides(
  sessionKey: string,
  cachedActivities: ActivityOverrideSource[] | undefined,
  composer: SendOverrides,
): SendOverrides {
  const fromRow = resolveActivityOverride(sessionKey, cachedActivities);
  if (fromRow.providerOverride === undefined) return composer;
  return {
    ...fromRow,
    effortOverride: validEffortOrDefault(
      fromRow.providerOverride,
      fromRow.modelOverride,
      composer.effortOverride,
    ),
    modeOverride: composer.modeOverride,
  };
}
