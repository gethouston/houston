import { Button } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import type { ProviderConnections } from "../../hooks/use-provider-connections.ts";
import type { ProviderInfo } from "../../lib/providers.ts";

/**
 * The provider modal's connected footer: which provider is signed in, the
 * disconnect action, and the optional "Set as default". A local
 * (OpenAI-compatible) provider disconnects through the bridge teardown instead of
 * a credential sign-out, hence the separate `onDisconnectLocal`.
 *
 * Extracted from `provider-modal.tsx` to keep that file inside the size budget.
 */
export function ProviderModalFooter({
  provider,
  connections,
  isLocal,
  disconnecting,
  onDisconnectLocal,
  onSetDefault,
}: {
  provider: ProviderInfo;
  connections: ProviderConnections;
  /** The provider is a local OpenAI-compatible server. */
  isLocal: boolean;
  /** A local disconnect is in flight. */
  disconnecting: boolean;
  onDisconnectLocal: () => void;
  onSetDefault?: (provider: ProviderInfo) => void;
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
        {onSetDefault && (
          <Button size="sm" onClick={() => onSetDefault(provider)}>
            {t("providerModal.setDefault")}
          </Button>
        )}
      </div>
    </div>
  );
}
