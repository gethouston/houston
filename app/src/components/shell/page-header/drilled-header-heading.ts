/**
 * Which lozenge of a drilled header carries the page's `<h1>`: the one the user
 * is ON. The heading names the screen, and the screen is whichever section is
 * active — the folded phone form already reads the active lozenge as its
 * heading, so a wide cluster heading any other lozenge would announce one
 * screen while showing another.
 *
 * An `active` that names no item leaves the caller's own flags standing, so a
 * header mid-navigation still has a heading rather than none.
 */
export function headingItems<Item extends { id: string; heading?: boolean }>(
  items: Item[],
  active: string,
): Item[] {
  if (!items.some((item) => item.id === active)) return items;
  return items.map((item) => ({ ...item, heading: item.id === active }));
}
