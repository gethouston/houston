import { Button } from "@houston-ai/core";
import { CornerDownLeft, Loader2, LogIn } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { CredentialStepMode } from "./chat-credential-step-fields";

export function CredentialStepCta({
  mode,
  missing,
  formId,
  ready,
  retry,
  signInPending,
  submitting,
  onSignIn,
}: {
  mode: CredentialStepMode;
  missing: boolean;
  formId: string;
  ready: boolean;
  retry: boolean;
  signInPending: boolean;
  submitting: boolean;
  onSignIn: () => void;
}) {
  const { t } = useTranslation("chat");
  if (missing) return null;
  if (mode === "oauth") {
    return (
      <Button
        className="gap-1.5"
        disabled={signInPending}
        onClick={onSignIn}
        size="sm"
        type="button"
      >
        {signInPending ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <LogIn className="size-3.5" />
        )}
        {t(retry ? "credential.signInAgain" : "credential.signIn")}
      </Button>
    );
  }
  return (
    <Button
      className="gap-1.5"
      disabled={!ready || submitting}
      form={formId}
      size="sm"
      type="submit"
    >
      {submitting ? (
        <>
          <Loader2 className="size-3.5 animate-spin" />
          {t("credential.saving")}
        </>
      ) : (
        <>
          {t("credential.save")}
          <CornerDownLeft className="size-3.5 opacity-70" />
        </>
      )}
    </Button>
  );
}
