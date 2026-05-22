/**
 * Feature flag substrate. Phase 0 — plumbing only, registry intentionally
 * empty. Future phases each add one `FlagDef` to `FLAG_REGISTRY`.
 *
 * Design rules (see `knowledge-base/feature-flags.md`):
 *   1. Stay with string-typed `/v1/preferences/:key` storage; encode booleans
 *      as `"true"` / `"false"`. Three states: true / false / unset.
 *   2. Two-level namespace — `<category>.<feature_snake_case>`.
 *   3. One registry file. No flag exists without a `FlagDef` entry.
 *   4. Defaults live here, never in storage. Storage absence => code default.
 *   5. Declare `enforcementSurface` explicitly per flag.
 *  10. Renames / retirements flow through `FLAG_MIGRATIONS`; idempotent;
 *      runs once on app startup.
 *
 * The registry shape is the API future phases consume. Don't change the
 * `FlagDef` field set without updating every consumer + the doc.
 */
import { tauriPreferences } from "./tauri";
import { logger } from "./logger";

export type FlagCategory = "advanced"; // future: | "experiment" | "ops"

export type EnforcementSurface = "ui" | "engine" | "both";

export type FlagStatus = "beta" | "stable" | "graduating" | "retiring";

export interface FlagDef {
  /** Forever-API key. e.g. `"advanced.git_panel"`. Renaming requires `FLAG_MIGRATIONS`. */
  key: string;
  category: FlagCategory;
  /** Code default. Always `false` for new advanced flags. */
  default: boolean;
  /** i18n key — usually `"advanced.flags.<name>.label"`. */
  labelKey: string;
  /** i18n key — usually `"advanced.flags.<name>.description"`. */
  descriptionKey: string;
  enforcementSurface: EnforcementSurface;
  status: FlagStatus;
  /** Slug under `knowledge-base/advanced-<slug>.md` (optional). */
  learnMoreSlug?: string;
  /** Soft-hint dependencies. Never auto-flipped. */
  recommends?: string[];
  /** App version when the flag was introduced. */
  since: string;
  /** Version when default flips, or `"permanent"`, or `undefined` (TBD). */
  graduationTarget?: string;
}

/**
 * The flag registry. Phase 0 ships this empty by design — every subsequent
 * phase adds exactly one entry here plus the locale strings under
 * `advanced.flags.<key>.{label,description}` in en/es/pt.
 */
// biome-ignore lint/complexity/noBannedTypes: empty registry by design in phase 0
export const FLAG_REGISTRY: Record<string, FlagDef> = {};

export type FlagMigration =
  | { type: "rename"; from: string; to: string; since: string }
  | { type: "delete"; key: string; since: string };

/**
 * Append-only migration log. Each entry runs at most once per install (the
 * runner is idempotent — applying a `rename` whose `from` key is absent is
 * a no-op). Never edit an existing entry — add a new one.
 */
export const FLAG_MIGRATIONS: FlagMigration[] = [];

/** Encode a boolean for `/v1/preferences/:key` storage. */
export function flagToString(b: boolean): string {
  return b ? "true" : "false";
}

/**
 * Decode a stored preference value to a flag boolean. Returns `null` when
 * the value is unset / malformed — the caller falls back to the registry
 * default. Strict parse: only the literals `"true"` and `"false"` count.
 */
export function stringToFlag(s: string | null | undefined): boolean | null {
  if (s === "true") return true;
  if (s === "false") return false;
  return null;
}

/**
 * Resolve the code default for a flag key. Returns `false` when the key
 * isn't in the registry — defensive: never throw on a missing flag (rule 8).
 */
export function getFlagDefault(key: string): boolean {
  return FLAG_REGISTRY[key]?.default ?? false;
}

/**
 * Apply pending flag migrations once on app startup. Safe to call multiple
 * times — each migration is keyed on the storage state of its `from`/`key`
 * field, so re-runs are no-ops.
 *
 * Surfaces errors via the same toast-on-error path as `tauriPreferences`
 * (the `call()` wrapper in `tauri.ts`). Individual migrations that throw
 * are logged and skipped so a single bad entry doesn't block boot.
 */
export async function runFlagMigrations(): Promise<void> {
  for (const migration of FLAG_MIGRATIONS) {
    try {
      if (migration.type === "rename") {
        const oldValue = await tauriPreferences.get(migration.from);
        if (oldValue === null || oldValue === undefined) continue;
        const newValue = await tauriPreferences.get(migration.to);
        // Don't clobber an explicit value at the new key (e.g. user toggled
        // post-rename before the migration ran on this install).
        if (newValue === null || newValue === undefined) {
          await tauriPreferences.set(migration.to, oldValue);
        }
        // Clearing the old key: writing an empty string is the best the
        // preferences route gives us today (it has no DELETE handler). A
        // future engine route can replace this with a real delete.
        await tauriPreferences.set(migration.from, "");
      } else {
        const value = await tauriPreferences.get(migration.key);
        if (value === null || value === undefined) continue;
        await tauriPreferences.set(migration.key, "");
      }
    } catch (err) {
      logger.error(
        `[featureFlags] migration ${migration.type} failed for ${
          migration.type === "rename" ? migration.from : migration.key
        }: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
