import { Button } from "@houston-ai/core";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { queryKeys } from "../../../lib/query-keys";
import { tauriIntegrations } from "../../../lib/tauri";
import { appDisplay } from "../../integrations/app-display";
import { AppRow } from "../../integrations/app-row";
import { ProviderBrowser } from "../../provider-browser/provider-browser";
import { useProviderBrowserData } from "../../provider-browser/use-provider-browser-data";

/**
 * Step 1 of the done-screen's two-step setup (HOU-719 redesign): reconnect
 * the AI. Reuses the SAME `<ProviderBrowser>` the migration-reconnect moment
 * and onboarding use — it owns the OAuth launch, dialogs, polling, and
 * failure toasts. The browser is ALWAYS mounted (each provider shows its own
 * Connect / connected state inline) — we deliberately do NOT collapse it to a
 * one-line "connected" confirmation on mount, because that hid the provider
 * cards whenever a provider happened to be pre-connected (e.g. a dev machine
 * with shared credentials); the step is titled "Connect your AI", so the
 * cards must always be visible.
 */
export function DoneStepAi() {
  const { providers, connections, catalog } = useProviderBrowserData();
  return (
    <ProviderBrowser
      providers={providers}
      connections={connections}
      catalog={catalog}
      showFilters={false}
    />
  );
}

/** TODO(HOU-719): wire real per-app OAuth; today this is a visual placeholder
 *  and the row itself links out to the Apps section for the real flow. */
function noopConnect() {}

/**
 * Step 2: the apps the legacy agents had connected before, one row per
 * toolkit via the shared `<AppRow>` (real logo, real name, from the
 * Composio toolkit catalog). Connecting for real happens later in the
 * integrations surface; the Connect pill here is a placeholder so the row
 * doesn't read as dead.
 */
export function DoneStepApps({ integrations }: { integrations: string[] }) {
  const { t } = useTranslation("migration");

  // Toolkit catalog for real app names/logos; on a fetch failure (already
  // toasted + reported by the tauriIntegrations wrapper) the raw slugs render.
  const toolkitCatalog = useQuery({
    queryKey: queryKeys.integrationToolkits("composio"),
    queryFn: () => tauriIntegrations.toolkits("composio"),
    enabled: integrations.length > 0,
    staleTime: 5 * 60_000,
  });
  const bySlug = new Map(
    (toolkitCatalog.data ?? []).map((tk) => [tk.slug, tk]),
  );

  if (integrations.length === 0) return null;

  return (
    <ul className="flex flex-col gap-2">
      {integrations.map((slug) => (
        <li key={slug}>
          <AppRow
            display={appDisplay(slug, bySlug.get(slug))}
            trailing={
              <Button
                variant="secondary"
                size="sm"
                className="rounded-full"
                onClick={noopConnect}
              >
                {t("done.connect")}
              </Button>
            }
          />
        </li>
      ))}
    </ul>
  );
}
