/**
 * Active-dictation controls rendered in the composer trailing row while a
 * capture is in flight. All affordances are always visible (no hover gating):
 *  - DictationRecording: pulsing dot + live mm:ss + stop + cancel
 *  - DictationTranscribing: spinner + label
 */

import { Loader2Icon, SquareIcon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";
import type { DictationControl } from "./dictation-types";
import { formatElapsed } from "./dictation-types";

/** Ticks once a second while recording so the elapsed clock stays live. */
function useElapsedLabel(startedAt?: number): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (startedAt === undefined) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [startedAt]);
  return formatElapsed(startedAt, now);
}

const CONTROL_BUTTON =
  "flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-accent transition-colors";

export function DictationRecording({
  control,
  startedAt,
}: {
  control: DictationControl;
  startedAt?: number;
}) {
  const elapsed = useElapsedLabel(startedAt);
  const { labels } = control;
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex items-center gap-1.5 pl-1 pr-0.5" role="status">
        <span className="size-2 rounded-full bg-red-500 animate-pulse" />
        <span className="sr-only">{labels.recording}</span>
        <span className="text-xs tabular-nums text-muted-foreground">
          {elapsed}
        </span>
      </div>
      <button
        type="button"
        onClick={control.onCancel}
        className={CONTROL_BUTTON}
        aria-label={labels.cancel}
      >
        <XIcon className="size-5" />
      </button>
      <button
        type="button"
        onClick={control.onStop}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        aria-label={labels.stop}
      >
        <SquareIcon className="size-3.5 fill-current" />
      </button>
    </div>
  );
}

export function DictationTranscribing({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-1.5 px-1" role="status">
      <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}
