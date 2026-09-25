// `.ts` extensions so the node test runner can load this module on its own.
import { foldForSearch } from "../shell/choice-step-model.ts";

/** Folded catalog role label, in any shipped language, to its role id. */
export type RoleLabelIndex = ReadonlyMap<string, string>;

/** Indexes every language's role labels. The first language to claim a label
 *  keeps it, so a label two languages share resolves the same everywhere. */
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

/**
 * The role half of a badge's engraving: the catalog role, whichever language
 * its label is read in, else the typed words. Seeding from the label itself
 * would engrave the same employee differently per language.
 */
export function employeeEngravingRole(
  role: string,
  index: RoleLabelIndex,
): string {
  const folded = foldForSearch(role.trim());
  const id = index.get(folded);
  return id === undefined ? `text:${folded}` : `role:${id}`;
}

/** The color half: the palette id for any stored form of a palette color
 *  (id, light or dark value), the stored value for a legacy custom one, and
 *  the first palette color for none, as the card paints it. Seeding from the
 *  painted value would engrave differently per theme. */
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

/** FNV-1a keeps a badge's engraving stable across sessions and name edits. */
export function employeeMetalSeed(color: string, role: string): number {
  let hash = 2166136261;
  for (const char of `${color}\0${role}`) {
    hash = Math.imul(hash ^ (char.codePointAt(0) ?? 0), 16777619);
  }
  return hash >>> 0;
}

/** One compound path, in a 360 × 160 viewBox. Overscan fills every card width. */
export function employeeMetalPattern(seed: number): string {
  const phase = (seed % 360) * (Math.PI / 180);
  const bend = 18 + ((seed >>> 8) % 18);
  return Array.from({ length: 64 }, (_, line) => {
    const base = line * 5 - 80;
    return Array.from({ length: 25 }, (_, point) => {
      const x = point * 15;
      const y =
        base +
        Math.sin(x / 76 + phase) * bend +
        Math.sin(x / 137 - phase + base / 110) * 14;
      return `${point === 0 ? "M" : "L"}${x},${y.toFixed(2)}`;
    }).join(" ");
  }).join(" ");
}
