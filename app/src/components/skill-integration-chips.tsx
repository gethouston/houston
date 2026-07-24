import type { ReactNode } from "react";
import { skillIntegrationSlugs } from "../lib/skill-integrations";
import { IntegrationChips } from "./integrations";

/**
 * The logo row for the apps a skill declares in its frontmatter, or
 * `undefined` when it declares none.
 *
 * Returning `undefined` (rather than a component that renders `null`) is the
 * point: every host here puts the row in an optional slot with its own spacing
 * — {@link SkillCard}'s `footer`, the strip row's `trailing`, the edit modal's
 * `integrationsSlot` — and a truthy node that renders nothing would still open
 * that wrapper. A skill with no integrations must lay out exactly as before.
 */
export function skillIntegrationChips(
  integrations: readonly string[] | null | undefined,
  max?: number,
): ReactNode | undefined {
  const slugs = skillIntegrationSlugs(integrations);
  if (slugs.length === 0) return undefined;
  return <IntegrationChips slugs={slugs} max={max} />;
}
