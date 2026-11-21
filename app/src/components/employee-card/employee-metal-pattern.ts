import { foldForSearch } from "../shell/choice-step-model.ts";

export type RoleLabelIndex = ReadonlyMap<string, string>;

export function roleLabelIndex(
  labelSets: readonly Readonly<Record<string, string>>[],
): RoleLabelIndex {
  const index = new Map<string, string>();
  for (const labels of labelSets) {
    for (const [id, label] of Object.entries(labels)) {
      const folded = foldForSearch(label.trim());
      if (!index.has(folded)) index.set(folded, id);
    }
  }
  return index;
}

export function employeeEngravingRole(
  role: string,
  index: RoleLabelIndex,
): string {
  const folded = foldForSearch(role.trim());
  const id = index.get(folded);
  return id === undefined ? `text:${folded}` : `role:${id}`;
}

export function employeeEngravingColor(
  stored: string | undefined,
  palette: readonly { id: string; light: string; dark: string }[],
): string {
  if (!stored) return palette[0]?.id ?? "";
  const entry = palette.find(
    (c) => c.id === stored || c.light === stored || c.dark === stored,
  );
  return entry ? entry.id : stored;
}
