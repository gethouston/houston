import { CatalogTile } from "@houston-ai/core";
import type { ProviderInfo } from "../../lib/providers";
import { BrandMark } from "../provider-browser/brand-mark";

/**
 * The hub's consolidated "Connected" strip: every connected AI provider as an
 * icon TILE (the full-color {@link BrandMark}), sitting OUTSIDE the discovery
 * tabs via `CatalogShell` — identity, not discovery, exactly like the
 * Integrations page's Installed strip. A tile opens that provider's detail
 * modal (sign-out and its model list live there).
 */
export function ConnectedProvidersStrip({
  providers,
  onOpen,
}: {
  providers: readonly ProviderInfo[];
  onOpen: (provider: ProviderInfo) => void;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      {providers.map((provider) => (
        <CatalogTile
          key={provider.id}
          label={provider.name}
          onClick={() => onOpen(provider)}
        >
          <BrandMark providerId={provider.id} size="lg" />
        </CatalogTile>
      ))}
    </div>
  );
}
