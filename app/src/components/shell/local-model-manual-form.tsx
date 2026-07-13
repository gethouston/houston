import { Button } from "@houston-ai/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useReasoningToggle } from "../../hooks/use-reasoning-toggle";
import { genericErrorDescription } from "../../lib/error-toast";
import { connectManualEndpoint } from "../../lib/local-model-connect";
import { ReasoningToggle } from "./local-model-dialog-parts";
import { ShareEndpointToggle } from "./local-model-share-toggle";
import {
  LabeledTextField,
  SecretField,
} from "./openai-compatible-dialog-parts";

/**
 * The advanced / manual path of the local-model connect flow (and the web
 * fallback where no native bridge exists): the user types the server address +
 * model directly, with no tunnel. Reuses the field parts and copy from the
 * original manual dialog; the guided screens link here via "Enter details
 * manually".
 */
export function LocalModelManualForm({
  onConnected,
  onClose,
  onBack,
  shared,
  onSharedChange,
  teamWorkspace,
}: {
  onConnected?: (model: string) => void;
  onClose: () => void;
  onBack?: () => void;
  shared: boolean;
  onSharedChange: (value: boolean) => void;
  teamWorkspace: boolean;
}) {
  const { t } = useTranslation("providers");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { reasoning, setReasoning, applyModelDefault } = useReasoningToggle();

  // Typing a model id re-applies the reasoning default until the user flips the
  // toggle themselves (then their choice sticks).
  const handleModelChange = (next: string) => {
    setModel(next);
    applyModelDefault(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedUrl = baseUrl.trim();
    const trimmedModel = model.trim();
    if (!trimmedUrl) {
      setError(t("openaiCompatible.baseUrlRequired"));
      return;
    }
    if (!trimmedModel) {
      setError(t("openaiCompatible.modelRequired"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await connectManualEndpoint({
        baseUrl: trimmedUrl,
        model: trimmedModel,
        name: name.trim() || undefined,
        apiKey: key.trim() || undefined,
        ...(reasoning ? { reasoning: true } : {}),
        ...(teamWorkspace && shared ? { shared: true } : {}),
      });
      onConnected?.(trimmedModel);
      onClose();
    } catch (err) {
      setError(genericErrorDescription("local_model_manual_connect", err));
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 py-1">
      <LabeledTextField
        id="lm-base-url"
        label={t("openaiCompatible.baseUrlLabel")}
        help={t("openaiCompatible.baseUrlHelp")}
        value={baseUrl}
        onChange={setBaseUrl}
        placeholder={t("openaiCompatible.baseUrlPlaceholder")}
        disabled={submitting}
        mono
        inputMode="url"
      />
      <LabeledTextField
        id="lm-model"
        label={t("openaiCompatible.modelLabel")}
        help={t("openaiCompatible.modelHelp")}
        value={model}
        onChange={handleModelChange}
        placeholder={t("openaiCompatible.modelPlaceholder")}
        disabled={submitting}
        mono
      />
      <LabeledTextField
        id="lm-name"
        label={t("openaiCompatible.nameLabel")}
        help={t("openaiCompatible.nameHelp")}
        value={name}
        onChange={setName}
        placeholder={t("openaiCompatible.namePlaceholder")}
        disabled={submitting}
      />
      <SecretField
        id="lm-key"
        label={t("openaiCompatible.keyLabel")}
        help={t("openaiCompatible.keyHelp")}
        value={key}
        onChange={setKey}
        placeholder={t("openaiCompatible.keyPlaceholder")}
        disabled={submitting}
        show={showKey}
        onToggleShow={() => setShowKey((v) => !v)}
        showLabel={t("openaiCompatible.show")}
        hideLabel={t("openaiCompatible.hide")}
      />
      <ReasoningToggle
        id="lm-manual-reasoning"
        checked={reasoning}
        onChange={setReasoning}
        disabled={submitting}
      />
      {teamWorkspace && (
        <ShareEndpointToggle
          id="lm-manual-share"
          checked={shared}
          onChange={onSharedChange}
          disabled={submitting}
        />
      )}

      {error && (
        <p className="text-[12px] text-danger" role="alert">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onBack ?? onClose}
        >
          {onBack ? t("localModel.manual.back") : t("openaiCompatible.cancel")}
        </Button>
        <Button
          type="submit"
          disabled={submitting || !baseUrl.trim() || !model.trim()}
        >
          {submitting
            ? t("openaiCompatible.saving")
            : t("openaiCompatible.save")}
        </Button>
      </div>
    </form>
  );
}
