import type { CustomAuthMethod } from "@houston/engine-adapter";
import { Button } from "@houston-ai/core";
import { ExternalLink, KeyRound, Loader2, LogIn } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CustomCredentialForm } from "./integrations/custom-credential-form";

export type CredentialStepMode = "key" | "oauth";

export function CredentialStepIcon({
  iconUrl,
  mode,
  onIconError,
}: {
  iconUrl: string | null;
  mode: CredentialStepMode;
  onIconError: () => void;
}) {
  if (iconUrl) {
    return (
      <img
        alt=""
        className="size-4 shrink-0 rounded"
        onError={onIconError}
        src={iconUrl}
      />
    );
  }
  const Glyph = mode === "oauth" ? LogIn : KeyRound;
  return <Glyph className="size-4 shrink-0 text-ink-muted" />;
}

export function CredentialStepFields({
  mode,
  missing,
  authMethod,
  formId,
  awaitingGrant,
  blockedUrl,
  signInFailed,
  submitting,
  onOpenBlocked,
  onReadyChange,
  onSubmit,
}: {
  mode: CredentialStepMode;
  missing: boolean;
  authMethod: CustomAuthMethod | null;
  formId: string;
  awaitingGrant: boolean;
  blockedUrl: string | null;
  signInFailed: boolean;
  submitting: boolean;
  onOpenBlocked: () => void;
  onReadyChange: (ready: boolean) => void;
  onSubmit: (values: Record<string, string>) => void;
}) {
  const { t } = useTranslation("chat");
  if (missing) return null;
  if (mode === "oauth") {
    return (
      <>
        <p className="text-ink-muted text-sm">
          {t("credential.signInSubtitle")}
        </p>
        {awaitingGrant && (
          <p
            className="inline-flex items-center gap-1.5 text-ink-muted text-sm"
            role="status"
          >
            <Loader2 className="size-3.5 animate-spin" />
            {t("credential.signingIn")}
          </p>
        )}
        {blockedUrl && (
          <div className="flex flex-col items-start gap-1.5" role="status">
            <p className="text-ink text-sm">{t("credential.signInBlocked")}</p>
            <Button
              className="gap-1.5"
              onClick={onOpenBlocked}
              size="sm"
              type="button"
              variant="outline"
            >
              <ExternalLink className="size-3.5" />
              {t("credential.openSignIn")}
            </Button>
          </div>
        )}
        {signInFailed && (
          <p className="text-ink text-sm" role="alert">
            {t("credential.signInFailed")}
          </p>
        )}
      </>
    );
  }
  return (
    <>
      <p className="text-ink-muted text-sm">{t("credential.subtitle")}</p>
      <div className="mt-1.5">
        <CustomCredentialForm
          authMethod={authMethod}
          submitting={submitting}
          onSubmit={onSubmit}
          submitLabel={t("credential.save")}
          submittingLabel={t("credential.saving")}
          autoFocus
          formId={formId}
          hideSubmit
          onReadyChange={onReadyChange}
        />
      </div>
    </>
  );
}
