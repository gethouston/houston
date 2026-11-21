export function clickOpensRow(row: Node, target: EventTarget | null): boolean {
  return row.contains(target as Node | null);
}

export function keyOpensRow(
  key: string,
  target: EventTarget | null,
  row: EventTarget,
): boolean {
  return target === row && (key === "Enter" || key === " ");
}
