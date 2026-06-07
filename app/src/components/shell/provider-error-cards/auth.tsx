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
import { getProvider } from "../../../lib/providers";
import {
  isApiKeyOnlyProvider,
  isDualPathConnectProvider,
} from "../../../lib/provider-api-key";
import { tauriProvider } from "../../../lib/tauri";
import { ApiKeyAdvancedSection } from "../api-key-advanced-section";
import { ApiKeyForm } from "../api-key-form";
import { ErrorCard, providerLabel } from "./shared";

export function UnauthenticatedCard({
  error,
}: {
  error: Extract<ProviderError, { kind: "unauthenticated" }>;
}) {
  const { t } = useTranslation("shell");
  const [launching, setLaunching] = useState(false);
  const [apiKeyExpanded, setApiKeyExpanded] = useState(
    error.cause === "invalid_api_key",
  );
  const providerName = providerLabel(error.provider);
  const providerInfo = getProvider(error.provider);
  const apiKeyOnly = isApiKeyOnlyProvider(providerInfo);
  const dualPath =
    isDualPathConnectProvider(providerInfo) && !!providerInfo?.apiKeyConsoleUrl;

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
      case "unknown":
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
      title={t("providerError.unauthenticated.title", { provider: providerName })}
      body={t(bodyKey, { provider: providerName })}
    >
      {apiKeyOnly && providerInfo ? (
        <div className="min-w-0 w-full basis-full">
          <ApiKeyForm
            providerName={providerInfo.name}
            providerId={providerInfo.id}
            apiKeyConsoleUrl={providerInfo.apiKeyConsoleUrl ?? ""}
            credentialTarget="activeAgent"
            onSaved={() => {
              // Status poll / next send picks up the new key.
            }}
          />
        </div>
      ) : (
        <>
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
          {dualPath && providerInfo ? (
            <div className="min-w-0 w-full basis-full">
              <ApiKeyAdvancedSection
                provider={providerInfo}
                expanded={apiKeyExpanded}
                onExpandedChange={setApiKeyExpanded}
                credentialTarget="activeAgent"
                onSaved={() => {
                  // Status poll / next send picks up the new key.
                }}
              />
            </div>
          ) : null}
        </>
      )}
    </ErrorCard>
  );
}
