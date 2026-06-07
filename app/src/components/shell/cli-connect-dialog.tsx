import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Dialog,
  DialogDescription,
  DialogTitle,
} from "@houston-ai/core";
import type { ProviderInfo } from "../../lib/providers";
import { launchLocalProviderLogin } from "../../lib/local-provider-bridge";
import { providerUsesDeviceAuth } from "../../lib/provider-device-auth";
import { useUIStore } from "../../stores/ui";
import { ApiKeyAdvancedSection } from "./api-key-advanced-section";
import { ConnectDialogShell } from "./connect-dialog-layout";

interface Props {
  provider: ProviderInfo | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (providerId: string) => void;
  onLoginStarted: (providerId: string) => void;
}

function cliConnectDescriptionKey(providerId: string): string {
  if (providerId === "anthropic") return "cliConnect.descriptionAnthropic";
  if (providerId === "openai") return "cliConnect.descriptionOpenai";
  return "cliConnect.description";
}

export function CliConnectDialog({
  provider,
  onOpenChange,
  onSaved,
  onLoginStarted,
}: Props) {
  const { t } = useTranslation("providers");
  const addToast = useUIStore((s) => s.addToast);
  const [apiKeyExpanded, setApiKeyExpanded] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (provider) {
      setApiKeyExpanded(false);
      setSigningIn(false);
      setError(null);
    }
  }, [provider]);

  if (!provider) return null;

  const handleSignIn = async () => {
    setError(null);
    setSigningIn(true);
    try {
      await launchLocalProviderLogin(provider.id, { deviceAuth: providerUsesDeviceAuth() });
      onLoginStarted(provider.id);
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      addToast({
        title: t("cliConnect.signInFailed", { name: provider.name }),
        description: msg,
        variant: "error",
      });
      setSigningIn(false);
    }
  };

  return (
    <Dialog
      open={provider !== null}
      onOpenChange={(open) => {
        if (!open) onOpenChange(false);
      }}
    >
      <ConnectDialogShell
        header={
          <>
            <DialogTitle>{t("cliConnect.title", { name: provider.name })}</DialogTitle>
            <DialogDescription>
              {t(cliConnectDescriptionKey(provider.id), { name: provider.name })}
            </DialogDescription>
          </>
        }
        footer={
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("cliConnect.cancel")}
          </Button>
        }
      >
        <div className="space-y-4">
          <Button
            type="button"
            size="lg"
            className="w-full justify-center gap-2"
            onClick={handleSignIn}
            disabled={signingIn}
          >
            {signingIn ? t("cliConnect.signingIn") : t("cliConnect.signInWith", { name: provider.name })}
          </Button>
          <p className="text-center text-[12px] text-muted-foreground">
            {t("cliConnect.signInRecommended")}
          </p>
          {error && (
            <p className="text-center text-[12px] text-destructive" role="alert">
              {error}
            </p>
          )}
          <ApiKeyAdvancedSection
            provider={provider}
            expanded={apiKeyExpanded}
            onExpandedChange={setApiKeyExpanded}
            onSaved={() => {
              onSaved(provider.id);
              onOpenChange(false);
            }}
          />
        </div>
      </ConnectDialogShell>
    </Dialog>
  );
}
