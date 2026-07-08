/**
 * Trailing actions for the active-dictation composer takeover. The waveform
 * itself owns the input row (`dictation-waveform.tsx`); this renders the two
 * icon buttons that sit at the right end of the track:
 *  - recording / requesting: ✕ cancel (discard) + ✓ accept (stop + transcribe)
 *  - transcribing: a spinner replacing ✓ (nothing left to cancel)
 * All affordances are always visible (no hover gating) and keyboard-focusable.
 */

import { CheckIcon, Loader2Icon, XIcon } from "lucide-react";
import type { DictationControl } from "./dictation-types";

const ICON_BUTTON =
  "flex size-9 items-center justify-center rounded-full transition-colors";

/** ✕ cancel + ✓ accept, shown while requesting or recording. */
export function DictationActions({ control }: { control: DictationControl }) {
  const { labels } = control;
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={control.onCancel}
        className={`${ICON_BUTTON} text-muted-foreground hover:bg-accent`}
        aria-label={labels.cancel}
      >
        <XIcon className="size-5" />
      </button>
      <button
        type="button"
        onClick={control.onStop}
        className={`${ICON_BUTTON} bg-primary text-primary-foreground hover:bg-primary/90`}
        aria-label={labels.stop}
      >
        <CheckIcon className="size-5" />
      </button>
    </div>
  );
}

/** Spinner shown in the accept slot while the clip is being transcribed. */
export function DictationTranscribing({ label }: { label: string }) {
  return (
    <div className={ICON_BUTTON} aria-label={label} role="status">
      <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
    </div>
  );
}
