/**
 * Pure helpers for mutations over the activity list.
 *
 * Kept free of any engine / Tauri imports (only erased `import type`s) so
 * the read-mutate-write logic stays unit-testable in isolation. `data/activity.ts`
 * composes these with `readAgentJson` / `writeAgentJson`.
 */

// Subpath import (like `lib/active-interaction.ts`): the app's node:test runner
// loads value imports for real, and the package index's extensionless import
// chain only resolves under bundler resolution.
import { resolveInteractionPatch } from "@houston/protocol/interaction";
import type { Activity, ActivityUpdate } from "./activity";

/**
 * Merge one patch into one mission — the single write rule both `update()` and
 * `applyBulkPatch` compose, and the local-write twin of the host's
 * `applyActivityUpdate` (`packages/domain/src/activities.ts`). It mirrors that
 * twin field for field:
 *
 *  - an `undefined` VALUE is not a value: it leaves the stored field alone,
 *    rather than writing `undefined` over a schema-required one (a caller that
 *    spreads an optional into a patch must not blank `status` or `title`).
 *  - `pending_interaction` follows the shared rule in @houston/protocol
 *    ({@link resolveInteractionPatch}): `null` deletes the key, a structurally
 *    valid object replaces it, and an absent (or malformed) one leaves it alone
 *    EXCEPT on a `status: "done"` patch, which strips the blocking steps and
 *    keeps the optional clean-finish offers — closing a mission is the user's
 *    own move and answers whatever it was waiting on, but "what to do next" and
 *    "save this as a Skill" keep rendering on the Done card.
 */
export function applyActivityPatch(
  item: Activity,
  patch: ActivityUpdate,
  timestamp: string,
): Activity {
  const { pending_interaction, ...rest } = patch;
  const defined = Object.fromEntries(
    Object.entries(rest).filter(([, v]) => v !== undefined),
  );
  const merged: Activity = { ...item, ...defined, updated_at: timestamp };
  const outcome = resolveInteractionPatch({
    patched: pending_interaction,
    stored: merged.pending_interaction,
    status: patch.status,
  });
  if (outcome.kind === "set") merged.pending_interaction = outcome.interaction;
  else if (outcome.kind === "clear") delete merged.pending_interaction;
  return merged;
}

/** Apply `patch` to every item whose id is in `ids`, stamping `updated_at`.
 *  One shared rule with the single-row `update()` — see
 *  {@link applyActivityPatch} for the `pending_interaction` semantics. */
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

/** Drop one item by id. Missing ids are an idempotent no-op. */
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

/** Drop every item whose id is in `ids`. */
export function applyBulkRemove(
  items: Activity[],
  ids: ReadonlySet<string>,
): Activity[] {
  return items.filter((item) => !ids.has(item.id));
}
