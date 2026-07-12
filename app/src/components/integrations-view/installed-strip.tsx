import { CatalogTile } from "@houston-ai/core";
import type { IntegrationConnection } from "@houston-ai/engine-client";
import { type ActiveAppRow, AppLogo } from "../integrations";

/**
 * The horizontal row of installed (active) connections as icon TILES only, the
 * reference's "Installed" strip. No names, no chrome — the brand art IS the
 * tile (shared {@link CatalogTile}); hover paints the quiet `hover` fill,
 * matching the catalog rows. Each tile opens that connection's detail sheet.
 * The strip stays unfiltered by the catalog search (identity, not discovery).
 */
export function InstalledStrip({
  active,
  onOpen,
}: {
  active: ActiveAppRow[];
  onOpen: (connection: IntegrationConnection) => void;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      {active.map((row) => (
        <CatalogTile
          key={row.connection.connectionId}
          aria-label={row.app.name}
          title={row.app.name}
          onClick={() => onOpen(row.connection)}
        >
          <AppLogo display={row.app} size="lg" className="rounded-lg" />
        </CatalogTile>
      ))}
    </div>
  );
}
