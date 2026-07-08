/**
 * The provider modal: replaces the old provider-detail PAGE. A blocking,
 * centered modal (via `ModalShell`) that shows a provider's identity + how it
 * connects, a searchable list of the models it can run, and the connect /
 * sign-out actions. Not connected → a prominent Connect CTA; connected → a
 * live-status header and a footer with Sign out + (optional) Set as default.
 *
 * Presentational shell; connect/cancel/sign-out plumbing comes from the shared
 * `ProviderConnections`, exactly as the old provider-settings drove it.
 */

import { Button } from "@houston-ai/core";
import { X } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocalBridgeStatus } from "../../hooks/use-local-bridge-status.ts";
import type { ProviderConnections } from "../../hooks/use-provider-connections.ts";
import type { HubCatalog } from "../../lib/ai-hub/catalog-types.ts";
import { disconnectLocalModel } from "../../lib/local-model-connect.ts";
import type { ProviderInfo } from "../../lib/providers.ts";
import { BrandMark } from "../provider-browser/brand-mark.tsx";
import {
  authChipKey,
  providerDescriptionKey,
  providerModels,
} from "../provider-browser/provider-grouping.ts";
import { LocalModelStatusPill } from "../shell/local-model-status.tsx";
import { AuthBadge, LiveStatus, SpecChip } from "./hub-badges.tsx";
import { ModalShell } from "./modal-shell.tsx";
import { ModelsBrowser } from "./models-browser.tsx";
import { ConnectButton } from "./provider-modal-connect-button.tsx";

/** Map the four-way auth chip key onto the three `AuthBadge` icon families. */
function authBadgeKind(key: ReturnType<typeof authChipKey>) {
  if (key === "subscription") return "subscription" as const;
  if (key === "local") return "local" as const;
  return "apiKey" as const;
}

export function ProviderModal({
  provider,
  open,
  connections,
  catalog,
  onClose,
  onOpenModel,
  onSetDefault,
}: {
  provider: ProviderInfo;
  open: boolean;
  connections: ProviderConnections;
  catalog: HubCatalog;
  onClose: () => void;
  onOpenModel: (key: string) => void;
  /** Wire a default-provider action to show "Set as default" in the footer. */
  onSetDefault?: (provider: ProviderInfo) => void;
}) {
  const { t } = useTranslation("aiHub");
  const connected = connections.isConnected(provider);
  const busy = connections.busy[provider.id];
  const models = useMemo(
    () => providerModels(catalog, provider),
    [catalog, provider],
  );
  const isLocal = provider.auth === "openaiCompatible";
  const authKey = authChipKey(provider);

  // Local model: the bridge's live online/offline state + a "disconnect" that
  // also tears the tunnel down (not just clears the credential). The tunnel pill
  // shows ONLY when THIS session owns/owned a bridge; a direct/manual endpoint
  // (or a tunnel another machine manages) reads as normally connected instead.
  const localConnected = isLocal && connected;
  const {
    status: bridge,
    ownsBridge,
    appName: bridgeAppName,
    reconnect: reconnectBridge,
    reconnecting,
  } = useLocalBridgeStatus(localConnected);
  const showTunnelPill = localConnected && ownsBridge;
  const showConnectedBadge = connected && (!isLocal || !ownsBridge);
  const [disconnecting, setDisconnecting] = useState(false);
  const disconnectLocal = useCallback(async () => {
    setDisconnecting(true);
    try {
      await disconnectLocalModel();
      connections.refresh();
    } catch {
      // disconnectLocalModel already toasted the real reason (Report-bug).
    } finally {
      setDisconnecting(false);
    }
  }, [connections]);

  const header = (
    <div className="flex items-start gap-3 px-5 pt-5 pb-4">
      <BrandMark providerId={provider.id} size="lg" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="text-lg font-semibold text-foreground tracking-[-0.01em]">
          {provider.name}
        </span>
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          {t(`providers.${providerDescriptionKey(provider.id)}.description`)}
        </p>
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          <AuthBadge
            kind={authBadgeKind(authKey)}
            label={t(`card.${authKey}`)}
          />
          {models.length > 0 && (
            <SpecChip>{t("card.models", { count: models.length })}</SpecChip>
          )}
          {showConnectedBadge && <LiveStatus label={t("card.connected")} />}
        </div>
        {showTunnelPill && (
          <LocalModelStatusPill
            status={bridge?.status ?? "connecting"}
            appName={bridgeAppName}
            onRetry={reconnectBridge}
            retrying={reconnecting}
          />
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {!connected && (
          <ConnectButton provider={provider} connections={connections} />
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label={t("card.cancel")}
          className="grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-card-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );

  const footer = connected ? (
    <div className="flex items-center justify-between gap-3">
      <span className="min-w-0 truncate text-[13px] text-muted-foreground">
        {t("providerModal.signedInWith", { provider: provider.name })}
      </span>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            isLocal ? void disconnectLocal() : connections.signOut(provider)
          }
          disabled={busy === "signingOut" || disconnecting}
        >
          {isLocal ? t("providerModal.disconnect") : t("providerModal.signOut")}
        </Button>
        {onSetDefault && (
          <Button size="sm" onClick={() => onSetDefault(provider)}>
            {t("providerModal.setDefault")}
          </Button>
        )}
      </div>
    </div>
  ) : undefined;

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title={provider.name}
      description={t(
        `providers.${providerDescriptionKey(provider.id)}.description`,
      )}
      header={header}
      footer={footer}
    >
      {isLocal || models.length === 0 ? (
        <p className="px-5 py-8 text-center text-[13px] text-muted-foreground">
          {t("providerModal.noModels")}
        </p>
      ) : (
        <ModelsBrowser
          models={models}
          onOpenModel={onOpenModel}
          className="px-5 pb-4"
        />
      )}
    </ModalShell>
  );
}
