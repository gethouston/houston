import { useEffect, useRef, useState } from "react";
import { useAssistant } from "../../../hooks/use-assistant";
import { tauriConversationImports } from "../../../lib/conversation-import-facade";
import { logAndReportError } from "../../../lib/error-report";
import type { ScriptLine } from "../../../lib/manager-onboarding/script";
import {
  type OnboardingConversation,
  onboardingTranscript,
} from "../../../lib/manager-onboarding/transcript";
import type { ScriptCopy } from "./use-script-copy";

export function useFinishWithTranscript(
  conversation: OnboardingConversation,
  lines: readonly ScriptLine[],
  copy: ScriptCopy,
  finish: () => void,
): { saving: boolean; done: (then?: () => void) => void } {
  const { handle, isLoading, failure } = useAssistant();
  const [saving, setSaving] = useState(false);
  const started = useRef(false);
  const pending = useRef<{ then?: () => void } | null>(null);

  const save = async (): Promise<void> => {
    if (!handle) {
      if (failure)
        logAndReportError(
          "onboarding_transcript_unsaved",
          new Error(
            `the AI Manager's address is unknown, so the ${conversation} onboarding was not saved`,
          ),
        );
      return;
    }
    try {
      await tauriConversationImports.send(
        handle.agent,
        handle.conversation,
        onboardingTranscript(conversation, lines, copy),
      );
    } catch {}
  };

  const run = (then?: () => void) => {
    void save().then(() => {
      setSaving(false);
      then?.();
      finish();
    });
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: `run` reads the latest render's handle; the effect keys on discovery settling.
  useEffect(() => {
    if (isLoading || pending.current === null) return;
    const { then } = pending.current;
    pending.current = null;
    run(then);
  }, [isLoading]);

  const done = (then?: () => void) => {
    if (started.current) return;
    started.current = true;
    setSaving(true);
    if (isLoading) pending.current = { then };
    else run(then);
  };

  return { saving, done };
}

export function useOwedTranscriptRetry(): void {
  const { handle } = useAssistant();
  const sent = useRef(false);
  useEffect(() => {
    if (!handle || sent.current) return;
    sent.current = true;
    tauriConversationImports.retryOwed(handle.agent).catch(() => {});
  }, [handle]);
}
