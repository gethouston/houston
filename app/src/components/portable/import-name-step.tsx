/**
 * Step 2 of "From a friend": name, colour and model for the arriving agent.
 *
 * It renders the SAME `AgentIdentityForm` every other path that makes an agent
 * ends on, so naming an agent is one screen the user learns once. What is
 * particular to an import — the caption under the helmet — rides in that form's
 * header slot, and the model the agent will think with sits under it. The
 * column sets no height and no scroll of its own: the FlowSheet body is what
 * scrolls on a phone.
 */

import { useTranslation } from "react-i18next";
import { ChatModelSelector } from "../chat-model-selector";
import { AgentIdentityForm } from "../shell/agent-identity-form";

/** Ties the name field to nothing outside itself: the wizard's own Next button
 *  is the primary, and Enter in the field advances the same step. */
const IDENTITY_FORM_ID = "import-agent-identity";

export function ImportNameStep({
  name,
  onNameChange,
  color,
  onColorChange,
  provider,
  model,
  onProviderChange,
  onAdvance,
}: {
  name: string;
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
        error={null}
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
