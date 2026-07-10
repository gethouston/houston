import type { Activity, ActivityContributor } from "@houston/protocol";

/** Copy a contributor, keeping `name` only when it is defined. */
export const cloneContributor = (
  c: ActivityContributor,
): ActivityContributor =>
  c.name !== undefined
    ? { user_id: c.user_id, name: c.name }
    : { user_id: c.user_id };

/** Keep only well-formed contributors: an object with a string `user_id`, and
 *  a `name` only when it is a string. Malformed entries are dropped. */
export const sanitizeContributors = (v: unknown): ActivityContributor[] => {
  if (!Array.isArray(v)) return [];
  const out: ActivityContributor[] = [];
  for (const entry of v) {
    if (
      typeof entry === "object" &&
      entry !== null &&
      typeof (entry as { user_id?: unknown }).user_id === "string"
    ) {
      const e = entry as { user_id: string; name?: unknown };
      out.push(
        typeof e.name === "string"
          ? { user_id: e.user_id, name: e.name }
          : { user_id: e.user_id },
      );
    }
  }
  return out;
};

/**
 * Record a human as a contributor on a mission (Teams attribution). Pure and
 * dedup-by-`user_id`: an existing contributor keeps its position, its `name`
 * updated only when `author.name` is defined and differs; a new one is
 * appended. Never touches `updated_at` (board sort order must not churn from
 * stamping). Returns the SAME object reference when nothing changed, so callers
 * can skip the disk write.
 */
export function upsertContributor(
  activity: Activity,
  author: ActivityContributor,
): Activity {
  const existing = activity.contributors ?? [];
  const i = existing.findIndex((c) => c.user_id === author.user_id);
  if (i === -1) {
    return {
      ...activity,
      contributors: [...existing, cloneContributor(author)],
    };
  }
  const current = existing[i];
  if (current === undefined) return activity;
  if (author.name === undefined || author.name === current.name) {
    return activity;
  }
  const next = existing.slice();
  next[i] = { user_id: current.user_id, name: author.name };
  return { ...activity, contributors: next };
}
