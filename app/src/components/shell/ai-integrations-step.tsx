import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Loader2 } from "lucide-react";
import { DialogTitle } from "@houston-ai/core";
import type { SuggestedIntegration } from "@houston-ai/engine-client";
import { AiStepFooter } from "./ai-step-footer";
import {
  useConnections,
  useConnectedToolkits,
  useResetConnections,
  useComposioApps,
} from "../../hooks/queries";
import { useComposioAuth } from "../../hooks/use-composio-auth";
import { useComposioConnect } from "../../hooks/use-composio-connect";
import { ComposioAuthDialog } from "../composio-auth-dialog";
import { normalizeToolkitSlug } from "../../lib/composio-toolkits";

interface AiIntegrationsStepProps {
  suggestedIntegrations: SuggestedIntegration[];
  onBack: () => void;
  onContinue: () => void;
}

interface EnrichedIntegration {
  toolkit: string;
  name: string;
  description: string;
  logoUrl: string;
}

export function AiIntegrationsStep({
  suggestedIntegrations,
  onBack,
  onContinue,
}: AiIntegrationsStepProps) {
  const { t } = useTranslation("shell");
  const { data: result, isLoading } = useConnections();
  const reset = useResetConnections();
  const auth = useComposioAuth(() => reset());
  const isSignedIn = result?.status === "ok";
  const { data: connectedList } = useConnectedToolkits(isSignedIn);
  const connectedSet = useMemo(() => new Set(connectedList ?? []), [connectedList]);
  const { data: apiApps } = useComposioApps();
  const { connecting, connect } = useComposioConnect();

  const integrations = useMemo<EnrichedIntegration[]>(
    () =>
      suggestedIntegrations.map(({ slug, displayName }) => {
        const fromApi = apiApps?.find((a) => a.toolkit === slug);
        return {
          toolkit: slug,
          name: fromApi?.name ?? displayName,
          description: fromApi?.description ?? "",
          logoUrl: fromApi?.logo_url ?? "",
        };
      }),
    [suggestedIntegrations, apiApps],
  );

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <DialogTitle className="sr-only">{t("aiIntegrations.stepTitle")}</DialogTitle>

      <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-6 pt-6">
        <div className="max-w-2xl mx-auto space-y-6">
          <div>
            <h2 className="text-base font-semibold">{t("aiIntegrations.stepTitle")}</h2>
            <p className="text-sm text-muted-foreground">{t("aiIntegrations.stepDescription")}</p>
          </div>

          {!isLoading && result?.status === "not_installed" && (
            <p className="text-sm text-muted-foreground rounded-xl bg-secondary px-4 py-3">
              {t("aiIntegrations.notInstalledNote")}
            </p>
          )}

          {!isLoading && result?.status === "needs_auth" && (
            <div className="rounded-xl bg-secondary px-4 py-3 flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">{t("aiIntegrations.needsAuthNote")}</p>
              <button
                type="button"
                onClick={auth.startAuth}
                className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-foreground text-background text-xs font-medium hover:opacity-90 transition-opacity shrink-0"
              >
                {t("aiIntegrations.signIn")}
              </button>
            </div>
          )}

          {isSignedIn && integrations.length > 0 && (
            <div className="space-y-2">
              {integrations.map((app) => {
                const isConnected = connectedSet.has(normalizeToolkitSlug(app.toolkit));
                return (
                  <IntegrationCard
                    key={app.toolkit}
                    app={app}
                    isConnected={isConnected}
                    connecting={connecting === app.toolkit}
                    onConnect={connect}
                  />
                );
              })}
            </div>
          )}

        </div>
      </div>

      <AiStepFooter
        onBack={onBack}
        primaryLabel={t("aiIntegrations.continueButton")}
        onPrimary={onContinue}
      />

      <ComposioAuthDialog
        state={auth.state}
        onClose={auth.close}
        onReopenBrowser={auth.reopenBrowser}
        onRetry={auth.startAuth}
      />
    </div>
  );
}

function IntegrationCard({
  app,
  isConnected,
  connecting,
  onConnect,
}: {
  app: EnrichedIntegration;
  isConnected: boolean;
  connecting: boolean;
  onConnect: (toolkit: string) => void;
}) {
  const { t } = useTranslation("shell");
  const [imgError, setImgError] = useState(false);
  const initial = app.name.charAt(0).toUpperCase();
  const showAvatar = imgError || !app.logoUrl;

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-secondary">
      {showAvatar ? (
        <div className="size-8 rounded-lg bg-background flex items-center justify-center shrink-0">
          <span className="text-xs font-semibold text-muted-foreground">{initial}</span>
        </div>
      ) : (
        <img
          src={app.logoUrl}
          alt={app.name}
          className="size-8 rounded-lg object-contain shrink-0 bg-background"
          onError={() => setImgError(true)}
        />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-foreground truncate">{app.name}</p>
        {app.description && (
          <p className="text-[11px] text-muted-foreground truncate">{app.description}</p>
        )}
      </div>
      {isConnected ? (
        <span className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium shrink-0">
          <Check className="size-3" />
          {t("aiIntegrations.connected")}
        </span>
      ) : (
        <button
          type="button"
          onClick={() => onConnect(app.toolkit)}
          disabled={connecting}
          className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full border border-border bg-foreground text-background text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50 shrink-0"
        >
          {connecting ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            t("aiIntegrations.connect")
          )}
        </button>
      )}
    </div>
  );
}
