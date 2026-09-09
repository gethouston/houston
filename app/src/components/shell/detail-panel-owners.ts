/**
 * Ownership bookkeeping for the ONE shell-level detail panel.
 *
 * Every surface that renders the panel (the mission boards, the Routines chat,
 * the Archived lists, the skill / integration setup chats) portals into the
 * SAME container, and all of them stay MOUNTED while hidden — top-level screens
 * are kept alive. A single shared "panel is open" boolean therefore has
 * last-writer-wins semantics with no writer left to correct it: the screen the
 * user navigates AWAY from keeps its `true` on the flag while it stops portaling
 * anything in, and the shell paints an empty card next to the board
 * (PRODUCT-1229).
 *
 * A claim SET fixes both halves at once. A surface that leaves releases only
 * its own id, so it can never clobber the surface the user just navigated to
 * (the reason the Routines surface used to skip the release entirely), and the
 * panel is open exactly while at least one surface is actually rendering it.
 *
 * Each claim also says whether its surface may go WIDE (the chat taking the
 * whole content row instead of the 45% side card). Only the mission chats opt
 * in: a setup interview hosted by a catalog, or a chat that is a form's
 * companion, must keep its host visible, so the wide preference alone never
 * decides the layout — the claim on the panel does.
 */

export interface PanelOwner {
  id: string;
  /** Whether this surface's chat may fill the content row (`chatWide`). */
  wide: boolean;
}

/** Add or drop `ownerId`; returns the SAME array when nothing changed. */
export function setPanelOwner(
  owners: PanelOwner[],
  ownerId: string,
  open: boolean,
  wide = false,
): PanelOwner[] {
  const held = owners.some((o) => o.id === ownerId);
  if (held === open) return owners;
  return open
    ? [...owners, { id: ownerId, wide }]
    : owners.filter((o) => o.id !== ownerId);
}

/** Whether any surface holding the panel allows the wide layout. */
export function panelWideCapable(owners: PanelOwner[]): boolean {
  return owners.some((o) => o.wide);
}
