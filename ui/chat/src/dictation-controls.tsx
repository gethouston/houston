import { CheckIcon, Loader2Icon, XIcon } from "lucide-react";
import type { DictationControl } from "./dictation-types";

const ICON_BUTTON =
  "flex size-9 items-center justify-center rounded-full transition-colors";

export function DictationActions({ control }: { control: DictationControl }) {
  const { labels } = control;
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={control.onCancel}
        className={`${ICON_BUTTON} text-ink-muted hover:bg-hover`}
        aria-label={labels.cancel}
      >
        <XIcon className="size-5" />
      </button>
      <button
        type="button"
        onClick={control.onStop}
        className={`${ICON_BUTTON} bg-action text-action-text hover:bg-action/90`}
        aria-label={labels.stop}
      >
        <CheckIcon className="size-5" />
      </button>
    </div>
  );
}

export function DictationTranscribing({ label }: { label: string }) {
  return (
    <div className={ICON_BUTTON} aria-label={label} role="status">
      <Loader2Icon className="size-5 animate-spin text-ink-muted" />
    </div>
  );
}
