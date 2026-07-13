import { CatalogTile } from "@houston-ai/core";
import type {
  CustomIntegrationView,
  IntegrationConnection,
} from "@houston-ai/engine-client";
import { type AppDisplay, AppLogo } from "../integrations";

/** The minimal row shape a tile needs — both the global page's `ActiveAppRow`
 *  and the agent tab's usable rows satisfy it. */
export interface InstalledTileRow {
  connection: IntegrationConnection;
  app: AppDisplay;
}

/**
 * The CONSOLIDATED "Installed" strip: everything the user already has — active
 * catalog connections AND custom integrations — as icon TILES only, the
 * reference's "Installed" strip. It sits above the source tabs (identity, not
 * discovery), so it never changes when the user switches tabs and stays
 * unfiltered by either tab's search. No names, no chrome — the art IS the tile
 * (shared {@link CatalogTile}; custom integrations get their letter avatar);
 * hover paints the quiet `hover` fill and the name fades in beneath. A catalog
 * tile opens that connection's detail sheet; a custom tile jumps to the Custom
 * integrations tab, where its row (status, key, remove) lives.
 */
export function InstalledStrip({
  active,
  custom,
  onOpen,
  onOpenCustom,
}: {
  active: readonly InstalledTileRow[];
  custom: CustomIntegrationView[];
  onOpen: (connection: IntegrationConnection) => void;
  onOpenCustom: (integration: CustomIntegrationView) => void;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      {active.map((row) => (
        <CatalogTile
          key={row.connection.connectionId}
          label={row.app.name}
          onClick={() => onOpen(row.connection)}
        >
          <AppLogo display={row.app} size="lg" className="rounded-lg" />
        </CatalogTile>
      ))}
      {custom.map((integration) => (
        <CatalogTile
          key={integration.slug}
          label={integration.name}
          onClick={() => onOpenCustom(integration)}
        >
          <AppLogo
            display={{
              toolkit: integration.slug,
              name: integration.name,
              description: "",
              logoUrl: "",
            }}
            size="lg"
            className="rounded-lg"
          />
        </CatalogTile>
      ))}
    </div>
  );
}
