import { Check, ExternalLink, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { RowCard } from "./cards/row-card";
import { RowCardButton } from "./cards/row-card-button";
import type { ConnectCardView } from "./integration-connect-card-state";
import { AppLogo } from "./integrations";
import { CuratedConnectDialog } from "./integrations/curated-connect-dialog";
import { useChatConnect } from "./use-chat-connect";

interface IntegrationConnectCardProps {
  toolkit: string;
  agentId: string;
  accountScope?: boolean;
  onConnected?: (toolkit: string, appName: string) => void;
}

export function IntegrationConnectCard({
  toolkit,
  agentId,
  accountScope,
  onConnected,
}: IntegrationConnectCardProps) {
  const { t } = useTranslation("chat");
  const {
    app,
    isConnected,
    view,
    startConnect,
    curatedDialog,
    curatedProviderConnect,
    closeCuratedDialog,
  } = useChatConnect({
    toolkit,
    agentId,
    accountScope,
    onConnected,
  });

  return (
    <>
      <CuratedConnectDialog
        agentId={agentId}
        curated={curatedDialog}
        providerConnect={curatedProviderConnect}
        onClose={closeCuratedDialog}
      />
      <RowCard
        inline
        truncate
        media={<AppLogo display={app} />}
        title={app.name}
        description={
          isConnected
            ? t("composio.alreadyConnected")
            : app.description || t("composio.integration")
        }
        action={<ConnectStatusSlot view={view} onConnect={startConnect} />}
      />
    </>
  );
}

function ConnectStatusSlot({
  view,
  onConnect,
}: {
  view: ConnectCardView;
  onConnect: () => Promise<void>;
}) {
  const { t } = useTranslation("chat");

  if (view === "connected") {
    return (
      <span className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full bg-success/15 px-2.5 font-medium text-success-ink text-xs">
        <Check className="size-3" />
        {t("composio.connected")}
      </span>
    );
  }
  if (view === "connecting") {
    return (
      <span className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full bg-chip px-2.5 font-medium text-ink-muted text-xs">
        <Loader2 className="size-3 animate-spin" />
        {t("composio.connecting")}
      </span>
    );
  }
  return (
    <RowCardButton
      label={t("composio.connect")}
      onClick={onConnect}
      icon={<ExternalLink className="size-3" />}
      iconPosition="trailing"
    />
  );
}
