/**
 * Run one of the two composed acts on a workspace skill and refresh what it
 * moved, landed or not.
 *
 * Each act is a manifest write FOLLOWED by a delete of the employee's own
 * copy, so a rejection can still leave the manifest changed. Refreshing only
 * on success leaves the list, the manifest and the open skill showing the
 * state from before a write that did happen, with nothing to say so — the
 * caches are stale either way, so the refresh is unconditional and the
 * rejection still reaches the caller.
 */
export async function actThenRefresh(
  act: () => Promise<void>,
  refresh: () => void,
): Promise<void> {
  try {
    await act();
  } finally {
    refresh();
  }
}
