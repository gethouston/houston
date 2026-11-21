import type { ReactNode } from "react";
import { skillIntegrationSlugs } from "../lib/skill-integrations";
import { IntegrationChips } from "./integrations";

export function skillIntegrationChips(
  integrations: readonly string[] | null | undefined,
  max?: number,
): ReactNode | undefined {
  const slugs = skillIntegrationSlugs(integrations);
  if (slugs.length === 0) return undefined;
  return <IntegrationChips slugs={slugs} max={max} />;
}
