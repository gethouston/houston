import type { ProviderError } from "@houston-ai/chat";
import { CheckCircle2Icon, PlugZapIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { RowCard } from "../../cards/row-card";
import { RowCardButton } from "../../cards/row-card-button";
import { ProviderGlyph } from "../provider-logos";
import {
  type AuthCardButton,
  authCauseBodyKey,
  resolveAuthCardPresentation,
} from "./auth-presentation";
import { unhealableCause } from "./auth-unhealable.ts";
import { ReconnectDialog } from "./reconnect-dialog";
import { providerLabel } from "./shared";
import { useProviderLogin } from "./use-provider-login";

export function UnauthenticatedCard({
  error,
  onRetry,
}: {
  error: Extract<ProviderError, { kind: "unauthenticated" }>;
  onRetry?: () => Promise<void> | void;
}) {
  const { t } = useTranslation(["shell", "common"]);
  const login = useProviderLogin(error, onRetry);
  const hasProvider = !!error.provider;
  const provider = providerLabel(error.provider);

  const pres = resolveAuthCardPresentation({
    phase: login.phase,
    hasProvider,
    hasFailedPrompt: !!error.failed_prompt,
    hasRetry: !!onRetry,
    causeBodyKey: authCauseBodyKey(error.cause),
    unhealable: unhealableCause(error.cause),
  });

  const renderButton = (button: AuthCardButton) => {
    if (!button) return undefined;
    if (button.kind === "badge") {
      return (
        <RowCardButton
          label={t(button.labelKey)}
          onClick={() => {}}
          disabled
          loading={login.retrying}
          variant="outline"
        />
      );
    }
    if (button.action === "open_ai_hub") {
      return (
        <RowCardButton
          label={t(button.labelKey)}
          onClick={login.openAiHub}
          variant="default"
        />
      );
    }
    const isCancel = button.action === "cancel";
    return (
      <RowCardButton
        label={t(button.labelKey)}
        onClick={isCancel ? login.cancelSignIn : login.reconnect}
        loading={isCancel ? false : login.launching}
        variant={isCancel ? "outline" : "default"}
      />
    );
  };

  return (
    <div className="w-full px-1 py-2">
      <RowCard
        media={
          pres.variant === "done" ? (
            <CheckCircle2Icon className="size-5 text-success-ink" />
          ) : hasProvider ? (
            <ProviderGlyph providerId={error.provider} />
          ) : (
            <PlugZapIcon className="size-5" />
          )
        }
        title={t(pres.titleKey, { provider })}
        description={t(pres.bodyKey, {
          provider,
          detail: login.failureDetail ?? "",
        })}
        action={renderButton(pres.button)}
      />

      {login.surface && (
        <ReconnectDialog
          surface={login.surface}
          providerId={error.provider}
          open={login.showConnectDialog}
          onClose={login.closeConnectDialog}
        />
      )}
    </div>
  );
}
