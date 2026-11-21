import type { Activity, ActivityContributor } from "@houston/protocol";

export const cloneContributor = (
  c: ActivityContributor,
): ActivityContributor =>
  c.name !== undefined
    ? { user_id: c.user_id, name: c.name }
    : { user_id: c.user_id };

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
