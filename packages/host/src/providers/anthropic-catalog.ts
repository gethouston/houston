import {
  ANTHROPIC_LINEUP,
  anthropicLineupModel,
} from "@houston/domain/model-aliases";
import type { CatalogProvider } from "@houston/protocol";

export const ANTHROPIC_PROVIDER_ID = "anthropic";

const LINEUP_IDS: ReadonlySet<string> = new Set(
  Object.values(ANTHROPIC_LINEUP),
);

export function withAnthropicLineup(
  provider: CatalogProvider,
): CatalogProvider {
  const models = provider.models.flatMap((entry) => {
    if (LINEUP_IDS.has(entry.id)) return [entry];
    const runsAs = anthropicLineupModel(entry.id);
    return runsAs === undefined ? [] : [{ ...entry, runsAs }];
  });
  return { ...provider, models };
}
