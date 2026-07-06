import { AsyncButton, Button } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import type { ProviderConnections } from "../../hooks/use-provider-connections.ts";
import type { ProviderInfo } from "../../lib/providers.ts";

/** The provider modal header's Connect CTA: disabled until the status probe
 *  resolves, and swaps to Cancel while a connect is in flight. */
export function ConnectButton({
  provider,
  connections,
}: {
  provider: ProviderInfo;
  connections: ProviderConnections;
}) {
  const { t } = useTranslation("aiHub");
  const busy = connections.busy[provider.id];

  if (busy === "connecting") {
    return (
      <AsyncButton
        size="sm"
        variant="secondary"
        onClick={() => connections.cancel(provider)}
      >
        {t("card.cancel")}
      </AsyncButton>
    );
  }
  return (
    <Button
      size="sm"
      disabled={!connections.ready}
      onClick={() => connections.connect(provider)}
    >
      {t("providerModal.connect")}
    </Button>
  );
}
