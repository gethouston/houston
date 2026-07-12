import type { IntegrationConnection } from "@houston-ai/engine-client";
import { type ActiveAppRow, AppLogo } from "../integrations";

/**
 * The horizontal row of installed (active) connections as icon TILES only, the
 * reference's "Installed" strip. No names, no chrome — the brand art IS the
 * tile (a bordered box read as an outlined button and competed with the flat
 * page), so the strip is an at-a-glance shelf of what is already connected.
 * Hover paints the quiet `hover` fill, matching the catalog rows. Each tile
 * opens that connection's detail sheet. The strip stays unfiltered by the
 * catalog search (it is identity, not discovery).
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
        <button
          key={row.connection.connectionId}
          type="button"
          aria-label={row.app.name}
          title={row.app.name}
          onClick={() => onOpen(row.connection)}
          className="flex size-12 items-center justify-center rounded-xl transition-colors hover:bg-hover focus-visible:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/40"
        >
          <AppLogo display={row.app} size="lg" className="rounded-lg" />
        </button>
      ))}
    </div>
  );
}
