import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { useLocalModelConnect } from "../../hooks/use-local-model-connect";
import { osIsTauri } from "../../lib/os-bridge";
import type { ProviderInfo } from "../../lib/providers";
import {
  BusyScreen,
  EmptyScreen,
  ErrorScreen,
} from "./local-model-dialog-parts";
import { LocalModelManualForm } from "./local-model-manual-form";
import { PickScreen } from "./local-model-pick";

interface Props {
  provider: ProviderInfo | null;
  onClose: () => void;
  /** Called with the connected model id on success (before `onClose`) so the
   *  onboarding picker can select the real model the local server serves. */
  onConnected?: (model: string) => void;
}

/**
 * The guided "connect a local model" dialog: the world-class, non-technical
 * sibling of the manual OpenAI-compatible form. On desktop it detects LM Studio
 * / Jan / Ollama, then tunnels the chosen model up to the user's CLOUD agent
 * (mint credentials -> start bridge -> register endpoint) with a calm progress
 * state. No servers found -> a friendly, jargon-free empty state. In the browser
 * (no native bridge) it opens straight to the manual endpoint form.
 *
 * On success the engine fires `ProviderLoginComplete` (via setCustomEndpoint),
 * the same signal the OAuth / api-key paths emit, so the parent flips the card
 * and toasts. Failures surface as toasts (Report-bug) plus a calm retry state.
 *
 * Detection + connect run with a timeout, a Cancel affordance, and an
 * AbortController (see `useLocalModelConnect`): closing the dialog mid-flight
 * aborts the work and rolls back any half-open bridge.
 */
export function LocalModelDialog({ provider, onClose, onConnected }: Props) {
  const { t } = useTranslation("providers");
  const desktop = osIsTauri();
  const {
    mode,
    servers,
    selected,
    model,
    setModel,
    reasoning,
    setReasoning,
    selectServer,
    runDetect,
    connect,
    cancel,
    goManual,
  } = useLocalModelConnect({
    active: provider != null,
    desktop,
    onConnected,
    onClose,
  });

  if (!provider) return null;

  const isManual = mode === "manual";
  const title = isManual ? t("localModel.manual.title") : t("localModel.title");
  const description = isManual
    ? t("localModel.manual.description")
    : t("localModel.description");

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {mode === "detecting" && (
          <BusyScreen
            title={t("localModel.detecting")}
            onCancel={cancel}
            cancelLabel={t("localModel.cancel")}
          />
        )}
        {mode === "empty" && (
          <EmptyScreen onRecheck={() => void runDetect()} onManual={goManual} />
        )}
        {mode === "pick" && (
          <PickScreen
            servers={servers}
            selected={selected}
            onSelectServer={selectServer}
            model={model}
            onSelectModel={setModel}
            reasoning={reasoning}
            onReasoningChange={setReasoning}
            onConnect={() => void connect()}
            onManual={goManual}
          />
        )}
        {mode === "connecting" && (
          <BusyScreen
            title={t("localModel.connecting.title")}
            body={t("localModel.connecting.body")}
            onCancel={cancel}
            cancelLabel={t("localModel.cancel")}
          />
        )}
        {mode === "error" && (
          <ErrorScreen onRetry={() => void runDetect()} onManual={goManual} />
        )}
        {isManual && (
          <LocalModelManualForm
            onConnected={onConnected}
            onClose={onClose}
            onBack={desktop ? () => void runDetect() : undefined}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
