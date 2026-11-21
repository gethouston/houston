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
