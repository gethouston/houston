/**
 * Pure, import-free wire-shape helpers for the per-mission attribution face
 * stacks and the filter-by-person control (hosted Teams). Kept dependency-free
 * (mirrors `grant-set.ts`) so the row->Map translation and id normalization are
 * unit-tested under `node --test` without pulling a live Supabase client.
 */

/**
 * Public-facing profile of a human org member. The `profiles` table grants anon
 * a COLUMN-SCOPED select on exactly these fields (see
 * `supabase/migrations/20260628000000_profiles_anon_column_scope.sql`), so this
 * is a designed public surface, not a leak.
 */
export interface UserProfile {
  userId: string;
  name: string | null;
  avatarUrl: string | null;
}

/** The column-scoped row shape returned by the anon `profiles` select. */
export interface ProfileRow {
  user_id: string;
  name: string | null;
  avatar_url: string | null;
}

/**
 * Sorted, de-duplicated ids. Both the query key and the `.in()` argument use
 * this so the same set of contributors — in any order, with any repeats — hits
 * one stable cache entry instead of thrashing a new fetch per card render.
 */
export function normalizeUserIds(ids: string[]): string[] {
  return Array.from(new Set(ids)).sort();
}

/**
 * Pure rows -> Map mapping, keyed by `user_id`. A row whose `name`/`avatar_url`
 * is absent (never signed up under a display name, no uploaded avatar) maps to
 * explicit `null`, so a consumer can fall back to initials or a short id rather
 * than render an empty face.
 */
export function mapProfileRows(rows: ProfileRow[]): Map<string, UserProfile> {
  const map = new Map<string, UserProfile>();
  for (const row of rows) {
    map.set(row.user_id, {
      userId: row.user_id,
      name: row.name ?? null,
      avatarUrl: row.avatar_url ?? null,
    });
  }
  return map;
}
