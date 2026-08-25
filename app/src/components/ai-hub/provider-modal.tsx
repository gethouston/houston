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

import { X } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ProviderConnections } from "../../hooks/use-provider-connections.ts";
import type { HubCatalog } from "../../lib/ai-hub/catalog-types.ts";
import { providerDescription } from "../../lib/provider-overrides.ts";
import type { ProviderInfo } from "../../lib/providers.ts";
import { BrandMark } from "../provider-browser/brand-mark.tsx";
import {
  providerDescriptionKey,
  providerModels,
} from "../provider-browser/provider-grouping.ts";
import { LocalModelStatusPill } from "../shell/local-model-status.tsx";
import { SpecChip } from "../spec-chip.tsx";
import { LiveStatus } from "./hub-badges.tsx";
import { ModalShell } from "./modal-shell.tsx";
import { ModelsBrowser } from "./models-browser.tsx";
import { ConnectButton } from "./provider-modal-connect-button.tsx";
import { ProviderModalFooter } from "./provider-modal-footer.tsx";
import { useProviderModalLocal } from "./use-provider-modal-local.ts";

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
  // Tri-state (HOU-979): only a CONFIRMED connection gets the live badge, the
  // sign-out footer and the local-bridge treatment; only a CONFIRMED
  // disconnection gets the Connect CTA. An unconfirmable probe gets neither, so
  // the modal never guesses in either direction.
  const connection = connections.connectionState(provider);
  const connected = connection === "connected";
  const checking = connection === "checking";
  const models = useMemo(
    () => providerModels(catalog, provider),
    [catalog, provider],
  );
  const isLocal = provider.auth === "openaiCompatible";
  // Most hub providers have no aiHub:providers.* marketing copy — without a
  // default the modal renders the raw lookup key ("providers.xiaomi.description",
  // PRODUCT-1517). Fall back to the provider-list row's one-liner, which every
  // id resolves to.
  const description = t(
    `providers.${providerDescriptionKey(provider.id)}.description`,
    { defaultValue: providerDescription(provider.id) },
  );

  // Local model: the bridge state + a disconnect that tears the tunnel down.
  const {
    showTunnelPill,
    showConnectedBadge,
    bridge,
    bridgeAppName,
    reconnectBridge,
    reconnecting,
    disconnecting,
    disconnectLocal,
  } = useProviderModalLocal({
    isLocal,
    connected,
    onDisconnected: connections.refresh,
  });

  const header = (
    <div className="flex items-start gap-3 px-5 pt-5 pb-4">
      <BrandMark providerId={provider.id} size="lg" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="text-lg font-semibold text-ink tracking-[-0.01em]">
          {provider.name}
        </span>
        <p className="text-[13px] leading-relaxed text-ink-muted">
          {description}
        </p>
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          {models.length > 0 && (
            <SpecChip>{t("card.models", { count: models.length })}</SpecChip>
          )}
          {showConnectedBadge && <LiveStatus label={t("card.connected")} />}
          {checking && <SpecChip>{t("card.checking")}</SpecChip>}
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
        {connection === "disconnected" && (
          <ConnectButton provider={provider} connections={connections} />
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label={t("card.cancel")}
          className="grid size-8 place-items-center rounded-full text-ink-muted transition-colors hover:bg-card-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );

  const footer = connected ? (
    <ProviderModalFooter
      provider={provider}
      connections={connections}
      isLocal={isLocal}
      disconnecting={disconnecting}
      onDisconnectLocal={() => void disconnectLocal()}
      onSetDefault={onSetDefault}
    />
  ) : undefined;

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title={provider.name}
      description={description}
      header={header}
      footer={footer}
    >
      {isLocal || models.length === 0 ? (
        <p className="px-5 py-8 text-center text-[13px] text-ink-muted">
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
