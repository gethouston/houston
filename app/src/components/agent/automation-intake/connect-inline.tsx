import { Button } from "@houston-ai/core";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  useAgentCustomIntegrations,
  useSubmitCustomCredential,
} from "../../../hooks/queries";
import { ConnectFlowInline } from "../../integrations/connect-flow-inline";
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
  onConnected: () => void;
  onBack: () => void;
}

export function ConnectInline(props: ConnectInlineProps) {
  const list = useAgentCustomIntegrations(props.agentId);
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
  const busy = toolkit in connectFlow.states;
  const showFlow =
    toolkit in connectFlow.states || toolkit in connectFlow.notices;

  const start = async () => {
    const { outcome } = await connectFlow.connect(toolkit, `intake:${toolkit}`);
    if (outcome === "active") onConnected();
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-balance text-ink text-sm leading-snug">
        {t("triggerStep.connectReason", { app: appName })}
      </p>
      {showFlow && (
        <ConnectFlowInline
          appName={appName}
          connectFlow={connectFlow}
          toolkit={toolkit}
        />
      )}
      {!busy && (
        <Button
          className="gap-1.5 self-start"
          onClick={() => void start()}
          size="sm"
          type="button"
        >
          {t("triggerStep.connect")}
        </Button>
      )}
      <BackButton disabled={busy} onBack={onBack} />
    </div>
  );
}

function CredentialConnect({
  toolkit,
  appName,
  agentId,
  onConnected,
  onBack,
}: ConnectInlineProps) {
  const { t } = useTranslation("routines");
  const list = useAgentCustomIntegrations(agentId);
  const submit = useSubmitCustomCredential(agentId);
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
