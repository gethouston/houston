import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { queryKeys } from "../../../lib/query-keys";
import { tauriIntegrations } from "../../../lib/tauri";
import { appDisplay } from "../../integrations/app-display";
import { ProviderBrowser } from "../../provider-browser/provider-browser";
import { useProviderBrowserData } from "../../provider-browser/use-provider-browser-data";

/**
 * The two follow-ups on the wizard's done screen: reconnect the AI (the SAME
 * `<ProviderBrowser>` the migration-reconnect moment and onboarding use — it
 * owns the OAuth launch, dialogs, polling, and failure toasts) and a checklist
 * of the apps the legacy agents had connected (connecting happens later in the
 * integrations surface; here we just show what to expect).
 */
export function DoneFollowups({ integrations }: { integrations: string[] }) {
  const { t } = useTranslation("migration");
  const { providers, connections, catalog } = useProviderBrowserData();
  const [aiConnected, setAiConnected] = useState(false);

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

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="text-sm font-semibold">{t("done.reconnectAiTitle")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("done.reconnectAiBody")}
        </p>
        <div className="mt-3">
          {aiConnected ? (
            <p className="flex items-center gap-2 rounded-xl bg-secondary px-4 py-3 text-sm">
              <Check className="size-4" />
              {t("done.aiConnected")}
            </p>
          ) : (
            <ProviderBrowser
              providers={providers}
              connections={connections}
              catalog={catalog}
              onSelect={() => setAiConnected(true)}
              selectOnMount
              showFilters={false}
            />
          )}
        </div>
      </section>

      {integrations.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold">
            {t("done.reconnectAppsTitle")}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("done.reconnectAppsBody")}
          </p>
          <ul className="mt-3 flex flex-col gap-1">
            {integrations.map((slug) => {
              const app = appDisplay(slug, bySlug.get(slug));
              return (
                <li
                  key={slug}
                  className="flex items-center gap-3 rounded-xl bg-secondary px-4 py-2.5"
                >
                  <img
                    src={app.logoUrl}
                    alt=""
                    aria-hidden
                    className="size-5 rounded"
                  />
                  <span className="text-sm">{app.name}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
