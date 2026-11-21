import {
  ACTIVITY_MENTIONS_MAX,
  type Activity,
  type ActivityMention,
} from "@houston/protocol";

const cloneMention = (m: ActivityMention): ActivityMention =>
  m.by !== undefined
    ? { user_id: m.user_id, at: m.at, by: m.by }
    : { user_id: m.user_id, at: m.at };

export function sanitizeMentions(
  value: unknown,
): ActivityMention[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: ActivityMention[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry))
      continue;
    const e = entry as { user_id?: unknown; at?: unknown; by?: unknown };
    if (typeof e.user_id !== "string" || !e.user_id) continue;
    if (typeof e.at !== "string" || !e.at) continue;
    if (seen.has(e.user_id)) continue;
    seen.add(e.user_id);
    out.push(
      typeof e.by === "string"
        ? { user_id: e.user_id, at: e.at, by: e.by }
        : { user_id: e.user_id, at: e.at },
    );
  }
  if (out.length === 0) return undefined;
  if (out.length <= ACTIVITY_MENTIONS_MAX) return out;
  const keep = new Set(
    out
      .slice()
      .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
      .slice(0, ACTIVITY_MENTIONS_MAX)
      .map((m) => m.user_id),
  );
  return out.filter((m) => keep.has(m.user_id));
}

export function upsertMentions(
  activity: Activity,
  mentionedIds: string[],
  atIso: string,
  by?: string,
): Activity {
  const ids: string[] = [];
  for (const id of mentionedIds) {
    if (typeof id !== "string" || !id) continue;
    if (!ids.includes(id)) ids.push(id);
  }
  if (ids.length === 0) return activity;

  const next = (activity.mentioned ?? []).map(cloneMention);
  let changed = false;
  for (const id of ids) {
    const entry: ActivityMention =
      by !== undefined
        ? { user_id: id, at: atIso, by }
        : { user_id: id, at: atIso };
    const i = next.findIndex((m) => m.user_id === id);
    if (i === -1) {
      next.push(entry);
      changed = true;
      continue;
    }
    const current = next[i];
    if (current !== undefined && current.at === entry.at && current.by === by)
      continue;
    next[i] = entry;
    changed = true;
  }
  if (!changed) return activity;
  let capped = next;
  if (next.length > ACTIVITY_MENTIONS_MAX) {
    const keep = new Set(
      next
        .slice()
        .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
        .slice(0, ACTIVITY_MENTIONS_MAX)
        .map((m) => m.user_id),
    );
    capped = next.filter((m) => keep.has(m.user_id));
  }
  return { ...activity, mentioned: capped };
}
