import {
  ACTIVITY_MENTIONS_MAX,
  type Activity,
  type ActivityMention,
} from "@houston/protocol";

/** Copy a mention, keeping `by` only when it is defined. */
const cloneMention = (m: ActivityMention): ActivityMention =>
  m.by !== undefined
    ? { user_id: m.user_id, at: m.at, by: m.by }
    : { user_id: m.user_id, at: m.at };

/**
 * Sanitize an untrusted `mentioned` array read off disk (agents write
 * activity.json with file tools, so junk happens). Keep only objects with a
 * non-empty string `user_id` and a string `at`; `by` rides along only when it
 * is a string. The FIRST entry per `user_id` wins — a file that repeats a
 * person is already corrupt, and taking the first keeps the survivor a
 * function of the file, not of how far the scan ran.
 *
 * An over-cap file is trimmed the SAME way upsertMentions trims: keep the
 * newest ACTIVITY_MENTIONS_MAX by `at`, drop the oldest. Truncating in file
 * order instead would let a read silently discard the mentions a write just
 * decided were the ones worth keeping — the two sides must agree on which
 * mentions matter, or a hand-edited file quietly loses today's @mentions and
 * keeps last month's. Ties on `at` fall back to file order (the sort is
 * stable), so the survivor set is deterministic for a given file rather than
 * engine-dependent. Survivors come back in FILE order, not recency order: an
 * entry must never move just because the list was trimmed, exactly as
 * upsertMentions restores the original ordering after capping.
 *
 * `undefined` when nothing survives, so the caller can delete the key rather
 * than persist an empty array.
 */
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
  // `at` is ISO 8601, so lexicographic ordering IS chronological ordering —
  // the same comparison upsertMentions caps with, kept identical on purpose.
  const keep = new Set(
    out
      .slice()
      .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
      .slice(0, ACTIVITY_MENTIONS_MAX)
      .map((m) => m.user_id),
  );
  return out.filter((m) => keep.has(m.user_id));
}

/**
 * Record that `mentionedIds` were named in this mission at `atIso` by `by`.
 * Latest-per-person wins (an existing entry's `at`/`by` are overwritten);
 * new people are appended; the list is capped at ACTIVITY_MENTIONS_MAX by
 * dropping the OLDEST `at` first. Returns the SAME object reference when
 * nothing changed, so callers skip the disk write. Never touches `updated_at`
 * (board sort order must not churn from stamping).
 */
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
    // Re-stamping the same person with the same instant + author changes
    // nothing; leave the reference alone so the caller skips the disk write.
    if (current !== undefined && current.at === entry.at && current.by === by)
      continue;
    next[i] = entry;
    changed = true;
  }
  if (!changed) return activity;
  // Cap by dropping the OLDEST `at` first: sort a copy by recency, keep the
  // newest ACTIVITY_MENTIONS_MAX, then restore the original ordering so a
  // surviving entry never moves just because the list was trimmed.
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
