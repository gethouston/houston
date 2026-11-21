export interface PanelOwner {
  id: string;
  wide: boolean;
}

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

export function panelWideCapable(owners: PanelOwner[]): boolean {
  return owners.some((o) => o.wide);
}
