/**
 * Whether the cross-agent sweep's current result is an ANSWER — the board's
 * `isLoaded` (obligation 4 of the HOU-981 recovery: don't call a non-answer an
 * answer; its siblings live in lib/all-conversations-recovery.ts).
 *
 * TanStack reports `status: "success"` the moment placeholder data is handed
 * out, before any fetch settles. Rows must (and do) paint from that placeholder
 * immediately; what must NOT run on it is any verdict about the board being
 * empty. A user whose disk-restored roster variant happened to be `[]` got the
 * new-mission composer auto-opened over an empty board while the real sweep
 * painted underneath it.
 */
export function sweepIsAuthoritative(query: {
  isSuccess: boolean;
  isPlaceholderData: boolean;
}): boolean {
  return query.isSuccess && !query.isPlaceholderData;
}
