import { useTranslation } from "react-i18next";
import { ChatModelSelector } from "../chat-model-selector";
import { AgentIdentityForm } from "../shell/agent-identity-form";

const IDENTITY_FORM_ID = "import-agent-identity";

export function ImportNameStep({
  name,
  nameError,
  onNameChange,
  color,
  onColorChange,
  provider,
  model,
  onProviderChange,
  onAdvance,
}: {
  name: string;
  nameError: string | null;
  onNameChange: (value: string) => void;
  color: string;
  onColorChange: (value: string) => void;
  provider: string;
  model: string;
  onProviderChange: (provider: string, model: string) => void;
  onAdvance: () => void;
}) {
  const { t } = useTranslation("portable");
  return (
    <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-6">
      <AgentIdentityForm
        formId={IDENTITY_FORM_ID}
        name={name}
        color={color}
        error={nameError}
        nameInvalid={nameError !== null}
        onNameChange={onNameChange}
        onColorChange={onColorChange}
        onSubmit={(e) => {
          e.preventDefault();
          onAdvance();
        }}
        header={
          <div>
            <p className="text-lg font-semibold">
              {name.trim() || t("import.step2.placeholderName")}
            </p>
            <p className="mt-1 text-sm text-ink-muted">
              {t("import.step2.tagline")}
            </p>
          </div>
        }
      />
      <ChatModelSelector
        provider={provider}
        model={model}
        onSelect={onProviderChange}
        agent={null}
      />
    </div>
  );
}
