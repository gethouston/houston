import type { ProviderInfo } from "../../lib/providers";
import { isApiKeyOnlyProvider, isDualPathConnectProvider } from "../../lib/provider-api-key";
import { ApiKeyConnectDialog } from "./api-key-connect-dialog";
import { CliConnectDialog } from "./cli-connect-dialog";
import { GeminiConnectDialog } from "./gemini-connect-dialog";

interface Props {
  provider: ProviderInfo | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (providerId: string) => void;
  onLoginStarted: (providerId: string) => void;
}

/** Routes connect UI: dual-path CLI+key (Anthropic/OpenAI) or API-key-only. */
export function ProviderConnectDialog({
  provider,
  onOpenChange,
  onSaved,
  onLoginStarted,
}: Props) {
  if (!provider) return null;

  if (provider.id === "gemini") {
    return (
      <GeminiConnectDialog
        provider={provider}
        onOpenChange={onOpenChange}
        onSaved={onSaved}
        onLoginStarted={onLoginStarted}
      />
    );
  }

  if (isDualPathConnectProvider(provider)) {
    return (
      <CliConnectDialog
        provider={provider}
        onOpenChange={onOpenChange}
        onSaved={onSaved}
        onLoginStarted={onLoginStarted}
      />
    );
  }

  if (isApiKeyOnlyProvider(provider)) {
    return (
      <ApiKeyConnectDialog
        provider={provider}
        onOpenChange={onOpenChange}
        onSaved={onSaved}
      />
    );
  }

  return null;
}
