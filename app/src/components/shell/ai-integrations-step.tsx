import { useMemo, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Puzzle, Check, ExternalLink, Loader2 } from "lucide-react";
import { Button, DialogTitle } from "@houston-ai/core";
import {
  useConnections,
  useConnectedToolkits,
  useResetConnections,
  useComposioApps,
} from "../../hooks/queries";
import { useComposioAuth } from "../../hooks/use-composio-auth";
import { useComposioRefetchOnReturn } from "../../hooks/use-composio-refetch-on-return";
import { ComposioAuthDialog } from "../composio-auth-dialog";
import { tauriConnections, tauriSystem } from "../../lib/tauri";
import { normalizeToolkitSlug } from "../../lib/composio-toolkits";

interface AiIntegrationsStepProps {
  suggestedIntegrations: { slug: string; displayName: string }[];
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
  const markWaitingForAuth = useComposioRefetchOnReturn();
  const [connecting, setConnecting] = useState<string | null>(null);

  const integrations = useMemo<EnrichedIntegration[]>(
    () =>
      suggestedIntegrations.map(({ slug, displayName }) => {
        const fromApi = apiApps?.find((a) => a.toolkit === slug);
        return {
          toolkit: slug,
          name: fromApi?.name ?? displayName,
          description: fromApi?.description ?? "",
          logoUrl: fromApi?.logo_url || `https://www.google.com/s2/favicons?domain=${slug}.com&sz=128`,
        };
      }),
    [suggestedIntegrations, apiApps],
  );

  const handleConnect = useCallback(
    async (toolkit: string) => {
      setConnecting(toolkit);
      try {
        const { redirect_url } = await tauriConnections.connectApp(toolkit);
        tauriSystem.openUrl(redirect_url);
        markWaitingForAuth(toolkit);
      } catch {
        // surfaced via toast by the engine
      } finally {
        setConnecting(null);
      }
    },
    [markWaitingForAuth],
  );

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <button
        onClick={onBack}
        className="absolute top-5 left-5 rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
      </button>

      <DialogTitle className="sr-only">{t("aiIntegrations.stepTitle")}</DialogTitle>

      <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-6 pt-14">
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-primary/10 shrink-0">
              <Puzzle className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-semibold">{t("aiIntegrations.stepTitle")}</h2>
              <p className="text-sm text-muted-foreground">{t("aiIntegrations.stepDescription")}</p>
            </div>
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
                    onConnect={handleConnect}
                  />
                );
              })}
            </div>
          )}

          <Button onClick={onContinue} className="w-full rounded-full">
            {t("aiIntegrations.continueButton")}
          </Button>
        </div>
      </div>

      <ComposioAuthDialog
        state={auth.state}
        onClose={auth.close}
        onReopenBrowser={auth.reopenBrowser}
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

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-secondary">
      {imgError ? (
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
            <>
              {t("aiIntegrations.connect")}
              <ExternalLink className="size-3" />
            </>
          )}
        </button>
      )}
    </div>
  );
}
