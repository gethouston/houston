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

/**
 * Finishing an onboarding conversation: its lines are written into the AI
 * Manager's real conversation first, then `finish` hands the view to the
 * real chat, which opens on those same lines (the import re-seeds it) and
 * which the manager reads as its history from the next turn on.
 *
 * Finishing never waits on a failure. The import is reported and stays owed
 * on this device, and {@link useOwedTranscriptRetry} sends it on the next load.
 * An import the PAGE abandoned (a reload during the save aborts it) is not a
 * failure to finish on. The dying page used to finish anyway, stamping
 * `onboarding_completed` so the reload opened the app with an empty manager
 * chat (PRODUCT-2040). The SDK now HOLDS such an import (`turns.importMessages`
 * does not settle): on a page that really left nothing more happens here, the
 * stage stays pending, the import stays owed, and the next load resumes on the
 * closing and sends it. On a page that turns out to be live after all (a
 * back/forward-cache restore, a cancelled navigation) the SDK sends it again
 * and the save settles, so the finish below runs exactly once, late.
 *
 * A conversation finishes once: a second `done` (a double press, an ending
 * that finishes on its own) is ignored. `then` runs once the conversation is
 * saved, right before the view is handed over. A finish pressed while the
 * manager's address is still being discovered waits for discovery to answer,
 * so the conversation is not lost to a slow first load.
 */
export function useFinishWithTranscript(
  conversation: OnboardingConversation,
  lines: readonly ScriptLine[],
  copy: ScriptCopy,
  finish: () => void,
): { saving: boolean; done: (then?: () => void) => void } {
  const { handle, isLoading, failure } = useAssistant();
  const [saving, setSaving] = useState(false);
  const started = useRef(false);
  const pending = useRef<{ beforeFinish?: () => void } | null>(null);

  /** Never rejects: every failure is reported here or by the facade. Does
   *  not settle while the SDK holds an import the page abandoned. */
  const save = async (): Promise<void> => {
    if (!handle) {
      // A deployment with no manager owes nothing. One whose discovery failed
      // has no address to owe the conversation to.
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
    } catch {
      // The facade surfaced it, and it stays owed for the next load.
    }
  };

  const run = (then?: () => void) => {
    void save().then(() => {
      setSaving(false);
      then?.();
      finish();
    });
  };

  // A finish that waited on discovery runs the moment it answers.
  /* oxlint-disable react-hooks/exhaustive-deps -- `run` reads the latest render's handle; the effect keys on discovery settling. */
  useEffect(() => {
    if (isLoading || pending.current === null) return;
    const { beforeFinish } = pending.current;
    pending.current = null;
    run(beforeFinish);
  }, [isLoading]);
  /* oxlint-enable react-hooks/exhaustive-deps */

  const done = (then?: () => void) => {
    if (started.current) return;
    started.current = true;
    setSaving(true);
    if (isLoading) pending.current = { beforeFinish: then };
    else run(then);
  };

  return { saving, done };
}

/**
 * Sends the onboarding conversations this device still owes the manager,
 * once per session, as soon as the manager's address is known.
 */
export function useOwedTranscriptRetry(): void {
  const { handle } = useAssistant();
  const sent = useRef(false);
  useEffect(() => {
    if (!handle || sent.current) return;
    sent.current = true;
    tauriConversationImports.retryOwed(handle.agent).catch(() => {
      // `retryOwed` reported it; the imports stay owed.
    });
  }, [handle]);
}
