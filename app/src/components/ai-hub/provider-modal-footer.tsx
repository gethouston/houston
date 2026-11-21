import { Button } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import type { ProviderConnections } from "../../hooks/use-provider-connections.ts";
import type { ProviderInfo } from "../../lib/providers.ts";

export function ProviderModalFooter({
  provider,
  connections,
  isLocal,
  disconnecting,
  onDisconnectLocal,
}: {
  provider: ProviderInfo;
  connections: ProviderConnections;
  isLocal: boolean;
  disconnecting: boolean;
  onDisconnectLocal: () => void;
}) {
  const { t } = useTranslation("aiHub");
  const busy = connections.busy[provider.id];

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="min-w-0 truncate text-[13px] text-ink-muted">
        {t("providerModal.signedInWith", { provider: provider.name })}
      </span>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            isLocal ? onDisconnectLocal() : connections.signOut(provider)
          }
          disabled={busy === "signingOut" || disconnecting}
        >
          {isLocal ? t("providerModal.disconnect") : t("providerModal.signOut")}
        </Button>
      </div>
    </div>
  );
}
