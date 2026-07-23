/**
 * Pure, JSX-free defaults + resolver for {@link SkillMarketplaceCardLabels}, the
 * i18n-agnostic fallback the `ui/` boundary requires. Kept in a `.ts` module (no
 * JSX) so it is importable by the package's `node --experimental-strip-types
 * --test` runner (which cannot load `.tsx`), and so the row component and the
 * section labels share ONE default set rather than duplicating it.
 */

import type { SkillMarketplaceCardLabels } from "./skill-marketplace-row";

export const DEFAULT_CARD_LABELS: Required<SkillMarketplaceCardLabels> = {
  installAria: (name) => `Install ${name}`,
  installedAria: (name) => `${name} installed`,
  installsCount: (count, formatted) =>
    count === 1 ? `${formatted} install` : `${formatted} installs`,
  bySource: (owner) => `by ${owner}`,
};

/** Merge caller labels over the English defaults. */
export function resolveCardLabels(
  labels?: SkillMarketplaceCardLabels,
): Required<SkillMarketplaceCardLabels> {
  return { ...DEFAULT_CARD_LABELS, ...labels };
}
