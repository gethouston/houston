import { resolveInteractionPatch } from "@houston/protocol/interaction";
import { toCanonicalProviderId } from "@houston/sdk/provider-catalog";
import type { Activity, ActivityUpdate } from "./activity";

export function applyActivityPatch(
  item: Activity,
  patch: ActivityUpdate,
  timestamp: string,
): Activity {
  const { pending_interaction, provider, model, ...rest } = patch;
  const defined = Object.fromEntries(
    Object.entries(rest).filter(([, v]) => v !== undefined),
  );
  const merged: Activity = { ...item, ...defined, updated_at: timestamp };
  merged.last_message_at ??= item.updated_at ?? timestamp;
  if (provider === null) delete merged.provider;
  else if (provider !== undefined)
    merged.provider = toCanonicalProviderId(provider);
  if (model === null) delete merged.model;
  else if (model !== undefined) merged.model = model;
  const outcome = resolveInteractionPatch({
    patched: pending_interaction,
    stored: merged.pending_interaction,
    status: patch.status,
  });
  if (outcome.kind === "set") merged.pending_interaction = outcome.interaction;
  else if (outcome.kind === "clear") delete merged.pending_interaction;
  return merged;
}

export function applyBulkPatch(
  items: Activity[],
  ids: ReadonlySet<string>,
  patch: ActivityUpdate,
  timestamp: string,
): Activity[] {
  return items.map((item) =>
    ids.has(item.id) ? applyActivityPatch(item, patch, timestamp) : item,
  );
}

export function applyRemove(
  items: Activity[],
  id: string,
): { items: Activity[]; removed: boolean } {
  const idx = items.findIndex((item) => item.id === id);
  if (idx === -1) return { items, removed: false };
  return {
    items: [...items.slice(0, idx), ...items.slice(idx + 1)],
    removed: true,
  };
}

export function applyBulkRemove(
  items: Activity[],
  ids: ReadonlySet<string>,
): Activity[] {
  return items.filter((item) => !ids.has(item.id));
}
