import type { TriggerStatusItem } from "@houston/engine-adapter";
import { type TriggerRemedy, triggerRemedy } from "@houston/sdk";

export type TriggerRemedyHintKey =
  | "trigger.statusTriggerGoneHint"
  | "trigger.statusConfigRejectedHint";

export function remedyHintKey(
  remedy: TriggerRemedy,
): TriggerRemedyHintKey | null {
  switch (remedy) {
    case "pick_another_event":
      return "trigger.statusTriggerGoneHint";
    case "check_settings":
      return "trigger.statusConfigRejectedHint";
    default:
      return null;
  }
}

export function withRemedyDetail(
  item: TriggerStatusItem,
  translate: (key: TriggerRemedyHintKey) => string,
): TriggerStatusItem {
  const key = remedyHintKey(triggerRemedy(item));
  return key ? { ...item, detail: translate(key) } : item;
}

export function withRemedyDetails(
  statuses: Record<string, TriggerStatusItem>,
  translate: (key: TriggerRemedyHintKey) => string,
): Record<string, TriggerStatusItem> {
  let out: Record<string, TriggerStatusItem> | null = null;
  for (const [id, item] of Object.entries(statuses)) {
    const next = withRemedyDetail(item, translate);
    if (next === item) continue;
    out ??= { ...statuses };
    out[id] = next;
  }
  return out ?? statuses;
}
