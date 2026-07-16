/**
 * Best-effort toolkit slug for a bare Composio action slug. The action-approval
 * store keeps only the ACTION (e.g. `GMAIL_SEND_DRAFT`, `GOOGLE_MAPS_SEARCH`),
 * so the review section must re-derive which app it belongs to for the row's
 * logo + name. We pick the LONGEST catalog toolkit slug the action starts with,
 * so a multi-word slug (`google_maps`) wins over its first segment (`google`) —
 * mirroring the host's execute-time `resolveToolkit`. Falls back to the segment
 * before the first underscore when the catalog has no match (or has not loaded
 * yet). Pure + node-tested; the visible row label is HUMANIZED from this result,
 * never the raw slug.
 */
export function toolkitOfActionSlug(
  action: string,
  catalogSlugs: string[],
): string {
  const a = action.toLowerCase();
  let best: string | null = null;
  for (const slug of catalogSlugs) {
    const s = slug.toLowerCase();
    if ((a === s || a.startsWith(`${s}_`)) && (!best || s.length > best.length))
      best = s;
  }
  return best ?? a.split("_")[0] ?? "";
}
