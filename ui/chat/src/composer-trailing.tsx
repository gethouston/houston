import { MicIcon } from "lucide-react";
import { PromptInputSubmit } from "./ai-elements/prompt-input";
import { DictationActions, DictationTranscribing } from "./dictation-controls";
import type { DictationControl } from "./dictation-types";
import { isDictationActive, resolveDictationView } from "./dictation-types";

export interface ComposerTrailingProps {
  status: "ready" | "streaming" | "submitted";
  hasContent: boolean;
  onStop?: () => void;
  dictation?: DictationControl;
  disabled?: boolean;
  submitLabels?: { submit?: string; stop?: string };
}

export function ComposerTrailing({
  status,
  hasContent,
  onStop,
  dictation,
  disabled = false,
  submitLabels,
}: ComposerTrailingProps) {
  const view = resolveDictationView(dictation);

  if (isDictationActive(dictation) && dictation) {
    return (
      <div className="flex items-center gap-1.5 [grid-area:trailing]">
        {view.kind === "transcribing" ? (
          <DictationTranscribing label={dictation.labels.transcribing} />
        ) : (
          <DictationActions control={dictation} />
        )}
      </div>
    );
  }

  const submitDisabled = disabled || (status === "ready" && !hasContent);
  return (
    <div className="flex items-center gap-2 [grid-area:trailing] md:gap-1.5">
      {view.kind === "idle" && status === "ready" && !disabled && dictation && (
        <button
          type="button"
          onClick={dictation.onStart}
          className="relative flex h-9 w-9 items-center justify-center rounded-full text-ink-muted hover:bg-hover transition-colors after:absolute after:-inset-1 md:after:hidden"
          aria-label={dictation.labels.start}
        >
          <MicIcon className="size-5" />
        </button>
      )}
      <PromptInputSubmit
        status={status}
        onStop={onStop}
        disabled={submitDisabled}
        labels={submitLabels}
      />
    </div>
  );
}
