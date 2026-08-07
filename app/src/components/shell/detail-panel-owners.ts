/**
 * Ownership bookkeeping for the ONE shell-level detail panel.
 *
 * Every surface that renders the panel (the Activity board, the Routines chat,
 * the per-agent and Mission Control Archived lists, the skill / integration
 * setup chats) portals into the SAME container, and all of them stay MOUNTED
 * while hidden — agent tabs are only CSS-hidden, top-level screens are kept
 * alive. A single shared "panel is open" boolean therefore has last-writer-wins
 * semantics with no writer left to correct it: the tab the user navigates AWAY
 * from keeps its `true` on the flag while it stops portaling anything in, and
 * the shell paints an empty card next to the board (PRODUCT-1229).
 *
 * A claim SET fixes both halves at once. A surface that leaves releases only
 * its own id, so it can never clobber the surface the user just navigated to
 * (the reason the Routines tab used to skip the release entirely), and the
 * panel is open exactly while at least one surface is actually rendering it.
 */

/** Add or drop `ownerId`; returns the SAME array when nothing changed. */
export function setPanelOwner(
  owners: string[],
  ownerId: string,
  open: boolean,
): string[] {
  const held = owners.includes(ownerId);
  if (held === open) return owners;
  return open ? [...owners, ownerId] : owners.filter((id) => id !== ownerId);
}
