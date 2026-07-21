import { Button } from "@houston-ai/core";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  useCustomIntegrations,
  useSubmitCustomCredential,
} from "../../../hooks/queries";
import { ConnectWaitingPanel } from "../../integrations/connect-waiting-panel";
import { CustomCredentialForm } from "../../integrations/custom-credential-form";
import {
  customAuthMethod,
  isPendingCredential,
} from "../../integrations/custom-integrations-model";
import { useConnectFlow } from "../../integrations/use-connect-flow";

interface ConnectInlineProps {
  toolkit: string;
  appName: string;
  agentId: string;
  /** The connection landed / the key was saved — advance to event picking. */
  onConnected: () => void;
  /** Return to the app grid. */
  onBack: () => void;
}

/**
 * The inline connect panel shown after the user picks a not-yet-connected app.
 * Most apps hand off to the browser OAuth / hosted-key page via {@link
 * useConnectFlow} (same page collects an API key for key-based Composio apps);
 * a user-added custom (API / MCP) integration still waiting on its secret takes
 * the in-app {@link CustomCredentialForm} instead — detected the same way the
 * in-chat credential card decides. Either way, on success the connection view
 * refetches and we continue to picking the event. A back affordance always
 * returns to the app grid so this is never a dead end.
 */
export function ConnectInline(props: ConnectInlineProps) {
  const list = useCustomIntegrations();
  const view = list.data?.find((v) => v.slug === props.toolkit);
  const needsKey = !!view && isPendingCredential(view);

  return needsKey ? (
    <CredentialConnect {...props} />
  ) : (
    <OAuthConnect {...props} />
  );
}

function OAuthConnect({
  toolkit,
  appName,
  agentId,
  onConnected,
  onBack,
}: ConnectInlineProps) {
  const { t } = useTranslation("routines");
  const connectFlow = useConnectFlow({ agentId });
  const busy = connectFlow.state !== null;
  const waiting =
    connectFlow.state?.toolkit === toolkit &&
    connectFlow.state.step === "waiting";

  const start = async () => {
    const outcome = await connectFlow.connect(toolkit);
    if (outcome === "active") onConnected();
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-balance text-ink text-sm leading-snug">
        {t("triggerStep.connectReason", { app: appName })}
      </p>
      {waiting ? (
        <ConnectWaitingPanel appName={appName} connectFlow={connectFlow} />
      ) : (
        <Button
          className="gap-1.5 self-start"
          disabled={busy}
          onClick={() => void start()}
          size="sm"
          type="button"
        >
          {busy && <Loader2 className="size-3.5 animate-spin" />}
          {busy ? t("triggerStep.connecting") : t("triggerStep.connect")}
        </Button>
      )}
      <BackButton disabled={busy} onBack={onBack} />
    </div>
  );
}

function CredentialConnect({
  toolkit,
  appName,
  onConnected,
  onBack,
}: ConnectInlineProps) {
  const { t } = useTranslation("routines");
  const list = useCustomIntegrations();
  const submit = useSubmitCustomCredential();
  const view = list.data?.find((v) => v.slug === toolkit);
  const authMethod = view ? customAuthMethod(view) : null;

  const onSubmit = (values: Record<string, string>) => {
    submit.mutate(
      { slug: toolkit, values },
      { onSuccess: () => onConnected() },
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-balance text-ink text-sm leading-snug">
        {t("triggerStep.connectKeyReason", { app: appName })}
      </p>
      <CustomCredentialForm
        authMethod={authMethod}
        submitting={submit.isPending}
        onSubmit={onSubmit}
        submitLabel={t("triggerStep.saveKey")}
        submittingLabel={t("triggerStep.savingKey")}
        autoFocus
      />
      <BackButton disabled={submit.isPending} onBack={onBack} />
    </div>
  );
}

function BackButton({
  disabled,
  onBack,
}: {
  disabled: boolean;
  onBack: () => void;
}) {
  const { t } = useTranslation("routines");
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onBack}
      className="inline-flex items-center gap-1 self-start text-ink-muted text-xs transition-colors hover:text-ink focus-visible:text-ink focus-visible:outline-none disabled:opacity-60"
    >
      <ArrowLeft className="size-3.5" />
      {t("triggerStep.back")}
    </button>
  );
}
