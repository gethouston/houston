/**
 * While dictation is CAPTURING, the textarea that owns the composer's keydown
 * handler is replaced by the waveform, so Escape/Enter have no focus target.
 * This listens on the document for the duration of the capture instead:
 * Escape discards, Enter (no shift) accepts — the same as clicking the check
 * (stop + transcribe). While TRANSCRIBING the hook is inactive (not a
 * capturing state), so Enter does nothing.
 *
 * Extracted from `chat-input.tsx` so that file stays a composer layout.
 */

import { useEffect } from "react";
import type { DictationControl } from "./dictation-types.ts";
import { isDictationCapturing } from "./dictation-types.ts";

export function useDictationHotkeys(dictation: DictationControl | undefined) {
  const capturing = isDictationCapturing(dictation);
  useEffect(() => {
    if (!capturing) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        dictation?.onCancel();
        return;
      }
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        dictation?.onStop();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [capturing, dictation]);
}
