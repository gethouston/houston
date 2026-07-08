import { Spinner } from "@houston-ai/core";
import type { IntegrationToolkit } from "@houston-ai/engine-client";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AppCatalogGrid } from "./app-catalog-grid";

interface CatalogBrowserProps {
  catalog: IntegrationToolkit[];
  /** The surface-owned category selection (`"all"` = no filter). */
  category: string;
  onCategoryChange: (next: string) => void;
  connectedToolkits: ReadonlySet<string>;
  /** Toolkit mid-OAuth (spinner on its row); disables every other Connect. */
  connectingToolkit: string | null;
  /** Toolkits to hide entirely (agent context surfaces them elsewhere, e.g. in
   *  the "Ready to activate" group), so no app is listed twice. */
  excludeToolkits?: ReadonlySet<string>;
  /** The catalog is still fetching (show a loader, not a "no apps" message). */
  loading?: boolean;
  onConnect: (toolkit: string) => void;
}

/**
 * The connect browser over the full ~1000-app catalog. Thin wrapper over the
 * shared {@link AppCatalogGrid}: it only maps each app to its trailing action.
 * A connected app renders a static "Connected" label; every other app is a
 * clickable Connect row (spinner while its OAuth is mid-flight, disabled while
 * another connect is in flight).
 */
export function CatalogBrowser({
  catalog,
  category,
  onCategoryChange,
  connectedToolkits,
  connectingToolkit,
  excludeToolkits,
  loading,
  onConnect,
}: CatalogBrowserProps) {
  const { t } = useTranslation("integrations");
  const busy = connectingToolkit !== null;

  return (
    <AppCatalogGrid
      catalog={catalog}
      category={category}
      onCategoryChange={onCategoryChange}
      excludeToolkits={excludeToolkits}
      loading={loading}
      renderRow={(_display, tk) => {
        if (connectedToolkits.has(tk.slug)) {
          return {
            trailing: (
              <span className="text-[11px] font-medium text-muted-foreground">
                {t("picker.connected")}
              </span>
            ),
          };
        }
        const connecting = connectingToolkit === tk.slug;
        return {
          onClick: busy ? undefined : () => onConnect(tk.slug),
          trailing: connecting ? (
            <Spinner className="size-3.5 text-muted-foreground" />
          ) : (
            <Plus className="size-3.5 text-muted-foreground/60" />
          ),
        };
      }}
    />
  );
}
