import type { SpecimenGroup, SpecimenTier } from "./registry";

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

export function countSpecimens(tiers: readonly SpecimenTier[]): number {
  return tiers.reduce(
    (total, tier) =>
      total +
      tier.groups.reduce((sum, group) => sum + group.specimens.length, 0),
    0,
  );
}
