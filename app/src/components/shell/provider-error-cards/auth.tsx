/**
 * UnauthenticatedCard — drives the user back into the provider's connect flow.
 * Body copy varies by cause (see `authCauseBodyKey`) so the user understands WHY
 * they must reconnect. The state -> title/body/button mapping lives in
 * `./auth-presentation`; every side effect (launch, cancel, auto-resume) lives
 * in `./use-provider-login`. This component only renders what those two decide.
 *
 * When the error names NO provider (nothing is connected yet), the card drops
 * every brand-specific element — glyph, name, sign-in launch — and becomes a
 * generic "connect an AI provider" prompt that opens the AI Hub. Any provider's
 * successful connect then satisfies it and triggers the same auto-resume.
 */

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
    // Org-policy block (PRODUCT-1393): reconnecting cannot heal it, so the
    // card's action opens the AI Hub (connect with an API key) instead.
    orgPolicyBlocked: error.cause === "org_policy_blocked",
  });

  // Map the resolved button spec to its live handler + pending state. The
  // "done" resume badge is a disabled status pill that spins during the resume;
  // Cancel (bail out of the browser wait) is the only outline action pill.
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
      // Navigation, not a launch: nothing to spin on, nothing to cancel.
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
            <CheckCircle2Icon className="size-5 text-green-600" />
          ) : hasProvider ? (
            <ProviderGlyph providerId={error.provider} />
          ) : (
            // No id to draw: the glyph would fall back to a Monogram seeded
            // from "" — an empty tile. A plug icon reads as "connect one".
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
