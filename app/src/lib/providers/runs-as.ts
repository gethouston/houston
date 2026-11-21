import type { ProviderCatalog } from "@houston/protocol";
import { toCanonicalProviderId } from "@houston/sdk/provider-catalog";

const RUNS_AS = new Map<string, Map<string, string>>();

export function indexRunsAs(catalog: ProviderCatalog): void {
  RUNS_AS.clear();
  for (const provider of catalog) {
    for (const entry of provider.models) {
      if (!entry.runsAs) continue;
      let rows = RUNS_AS.get(provider.id);
      if (!rows) {
        rows = new Map();
        RUNS_AS.set(provider.id, rows);
      }
      rows.set(entry.id.toLowerCase(), entry.runsAs);
    }
  }
}

export function catalogRunsAs(provider: string, model: string): string | null {
  return (
    RUNS_AS.get(toCanonicalProviderId(provider))?.get(model.toLowerCase()) ??
    null
  );
}
