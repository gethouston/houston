import { type KeyboardEvent, useCallback } from "react";
import type { InputStatus } from "./chat-input-types";
import type { DictationControl } from "./dictation-types";
import { isDictationCapturing } from "./dictation-types";

export function useComposerKeyDown(opts: {
  mentionKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  dictation?: DictationControl;
  status: InputStatus;
  onStop?: () => void;
}) {
  const { mentionKeyDown, dictation, status, onStop } = opts;
  return useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      mentionKeyDown(e);
      if (e.defaultPrevented) return;
      if (e.key === "Escape" && isDictationCapturing(dictation)) {
        e.preventDefault();
        dictation?.onCancel();
        return;
      }
      if (e.key === "Escape" && status !== "ready" && onStop) {
        e.preventDefault();
        onStop();
      }
    },
    [status, onStop, dictation, mentionKeyDown],
  );
}
