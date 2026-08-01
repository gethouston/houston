import type { SpecimenGroup, SpecimenTier } from "./registry";

/**
 * The rail's text filter, applied to the whole two-tier tree at once.
 *
 * Matching is inclusive on purpose: typing a tier name ("primitives") or a
 * group name ("overlays") keeps that whole branch, because at that point you
 * are navigating, not searching. Typing anything else narrows to the specimen
 * titles that contain it, and a branch left with nothing drops out entirely
 * rather than leaving a heading over an empty space.
 *
 * An empty group survives only when it was named — with no query the areas that
 * have no pages yet still show (they are the map of the product), but a search
 * never answers with a heading that holds no result.
 */
export function filterTiers(
  tiers: readonly SpecimenTier[],
  query: string,
): SpecimenTier[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return tiers as SpecimenTier[];

  const kept: SpecimenTier[] = [];
  for (const tier of tiers) {
    const wholeTier = tier.name.toLowerCase().includes(needle);
    const groups: SpecimenGroup[] = [];
    for (const group of tier.groups) {
      const named = wholeTier || group.name.toLowerCase().includes(needle);
      const specimens = named
        ? group.specimens
        : group.specimens.filter((one) =>
            one.title.toLowerCase().includes(needle),
          );
      if (specimens.length > 0) groups.push({ name: group.name, specimens });
    }
    if (groups.length > 0) kept.push({ name: tier.name, groups });
  }
  return kept;
}

/** How many specimens a filtered tree holds — the rail's empty-state test. */
export function countSpecimens(tiers: readonly SpecimenTier[]): number {
  return tiers.reduce(
    (total, tier) =>
      total +
      tier.groups.reduce((sum, group) => sum + group.specimens.length, 0),
    0,
  );
}
