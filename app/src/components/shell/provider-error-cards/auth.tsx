/**
 * UnauthenticatedCard — drives the user back into the provider's
 * connect flow. Body copy varies by [`AuthFailureCause`] so the user
 * understands WHY they need to reconnect.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { KeyIcon } from "lucide-react";
import { Button, Spinner } from "@houston-ai/core";
import type { ProviderError } from "@houston-ai/chat";
import { tauriProvider } from "../../../lib/tauri";
import { ErrorCard, providerLabel } from "./shared";

export function UnauthenticatedCard({
  error,
}: {
  error: Extract<ProviderError, { kind: "unauthenticated" }>;
}) {
  const { t } = useTranslation("shell");
  const [launching, setLaunching] = useState(false);
  const provider = providerLabel(error.provider);

  // Map every cause to a body string so the user always sees a reason
  // (instead of a generic "session expired" wall). Keeps the card
  // honest about what we know.
  const bodyKey: string = (() => {
    switch (error.cause) {
      case "token_expired":
        return "providerError.unauthenticated.bodyTokenExpired";
      case "no_credentials":
        return "providerError.unauthenticated.bodyNoCredentials";
      case "invalid_api_key":
        return "providerError.unauthenticated.bodyInvalidApiKey";
      case "token_revoked":
        return "providerError.unauthenticated.bodyTokenRevoked";
      default:
        return "providerError.unauthenticated.bodyUnknown";
    }
  })();

  const reconnect = async () => {
    if (launching) return;
    setLaunching(true);
    try {
      await tauriProvider.launchLogin(error.provider);
    } finally {
      setLaunching(false);
    }
  };

  return (
    <ErrorCard
      icon={<KeyIcon className="size-5" />}
      title={t("providerError.unauthenticated.title", { provider })}
      body={t(bodyKey, { provider })}
    >
      <Button
        size="sm"
        className="h-8 gap-2 rounded-full px-3 text-xs"
        disabled={launching}
        onClick={() => void reconnect()}
      >
        {launching ? (
          <Spinner className="size-3.5" />
        ) : (
          <KeyIcon className="size-3.5" />
        )}
        {t("providerError.unauthenticated.reconnect")}
      </Button>
    </ErrorCard>
  );
}
