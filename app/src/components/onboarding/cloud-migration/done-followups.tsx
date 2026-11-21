import { Button } from "@houston-ai/core";
import { Check, Loader2 } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  useIntegrationConnections,
  useIntegrationToolkits,
} from "../../../hooks/queries";
import { fireSetupConfetti } from "../../../lib/confetti";
import { appDisplay } from "../../integrations/app-display";
import { AppRow } from "../../integrations/app-row";
import { INTEGRATION_PROVIDER } from "../../integrations/model";
import { useConnectFlow } from "../../integrations/use-connect-flow";
import { ProviderBrowser } from "../../provider-browser/provider-browser";
import { useProviderBrowserData } from "../../provider-browser/use-provider-browser-data";
import { SuccessCheck } from "../success-check";
import { WizardFrame } from "./wizard-frame";

export function DoneStepAi() {
  const { providers, connections, catalog } = useProviderBrowserData();
  return (
    <ProviderBrowser
      providers={providers}
      connections={connections}
      catalog={catalog}
      curated
    />
  );
}

export function DoneCongrats({ onFinish }: { onFinish: () => void }) {
  const { t } = useTranslation("migration");
  useEffect(() => {
    fireSetupConfetti();
  }, []);
  return (
    <WizardFrame
      mark={<SuccessCheck />}
      title={t("done.congratsTitle")}
      body={t("done.congratsBody")}
      footer={
        <Button className="h-11 rounded-full px-6" onClick={onFinish}>
          {t("done.finish")}
        </Button>
      }
    />
  );
}

export function DoneStepApps({ integrations }: { integrations: string[] }) {
  const { t } = useTranslation("migration");

  const toolkitCatalog = useIntegrationToolkits(
    "composio",
    integrations.length > 0,
  );
  const bySlug = new Map(
    (toolkitCatalog.data ?? []).map((tk) => [tk.slug, tk]),
  );

  const connections = useIntegrationConnections(
    INTEGRATION_PROVIDER,
    integrations.length > 0,
  );
  const activeToolkits = new Set(
    (connections.data ?? [])
      .filter((c) => c.status === "active")
      .map((c) => c.toolkit),
  );

  const flow = useConnectFlow({});

  if (integrations.length === 0) return null;

  return (
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {integrations.map((slug) => {
        const isConnected = activeToolkits.has(slug);
        const inFlight = slug in flow.states;
        return (
          <li key={slug}>
            <AppRow
              display={appDisplay(slug, bySlug.get(slug))}
              trailing={
                isConnected ? (
                  <span className="inline-flex items-center gap-1.5 pr-1 text-xs font-medium text-success">
                    <Check className="size-4" strokeWidth={2.5} />
                    {t("done.connected")}
                  </span>
                ) : inFlight ? (
                  <span className="inline-flex items-center gap-2 pr-1 text-xs text-ink-muted">
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    {t("done.connecting")}
                    <button
                      type="button"
                      onClick={() => flow.cancel(slug)}
                      className="font-medium text-ink underline-offset-2 transition-colors hover:underline"
                    >
                      {t("done.cancel")}
                    </button>
                  </span>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="rounded-full"
                    onClick={() =>
                      void flow.connect(slug, `migrationFollowup:${slug}`)
                    }
                  >
                    {t("done.connect")}
                  </Button>
                )
              }
            />
          </li>
        );
      })}
    </ul>
  );
}
