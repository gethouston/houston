export function headingItems<Item extends { id: string; heading?: boolean }>(
  items: Item[],
  active: string,
): Item[] {
  if (!items.some((item) => item.id === active)) return items;
  return items.map((item) => ({ ...item, heading: item.id === active }));
}
