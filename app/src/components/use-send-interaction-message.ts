import type { MessageApproval } from "@houston/protocol/approval";
import { type RefObject, useCallback } from "react";
import { analytics } from "../lib/analytics";
import { logAndReportError } from "../lib/error-report";
import { classifyFileKind } from "../lib/file-kind";
import { sendInteractionReply } from "../lib/interaction-reply-send";
import type { ModelPin } from "../lib/model-selector-lock";
import {
  providerConnectStepScope,
  releaseProviderConnectStepResumes,
} from "../lib/provider-connect-step-memory";
import { showSendFailedToast } from "../lib/send-error-toast";
import { tauriAttachments, tauriChat } from "../lib/tauri";
import type { TurnMode } from "../lib/turn-mode";

export type SendInteractionMessage = (
  text: string,
  mode?: TurnMode,
  approvals?: MessageApproval[],
  files?: readonly File[],
) => Promise<boolean>;

/**
 * The ONE send every interaction card routes through (stepper completion,
 * suggested-action bubble, save-as-reusable, plan-ready). It sends the
 * composed reply as a normal user message; the turn start clears the
 * interaction, so the card retires through the same reactivity. A failure
 * surfaces through `showSendFailedToast` (the composer is gone, so a toast is
 * the only channel left) and resolves `false`, so a card keeps its attached
 * files for the retry. Never rejects.
 *
 * Every accepted send reports through `onSendReactivated`: a send that starts
 * a turn re-activates an archived mission, and a silent one strands the user
 * on a list the conversation just left.
 *
 * `mode` overrides the composer's pinned Mode for the one send (a suggested
 * follow-up runs in `execute`); omitted, the pinned mode. `approvals` carries
 * the receipts for the approval cards the sequence answered, as their OWN
 * field: only a user message can turn a host-issued request id into a usable
 * approval, and the host drops them before the runtime sees the turn.
 */
export function useSendInteractionMessage(args: {
  agentId: string;
  path: string | null | undefined;
  sessionKey: string | null | undefined;
  turnMode: TurnMode;
  resolveSendPin: () => Promise<ModelPin>;
  onSendReactivatedRef: RefObject<(() => void) | undefined>;
}): SendInteractionMessage {
  const {
    agentId,
    path,
    sessionKey,
    turnMode,
    resolveSendPin,
    onSendReactivatedRef,
  } = args;
  return useCallback(
    async (text, mode, approvals, files = []) => {
      // A provider connect claims its ONE resume of the conversation before
      // the reply is composed, so a reply that never leaves the client has to
      // give that claim back, or the retry is refused by a guard standing for
      // a nudge the agent never heard.
      const releaseResumes = () =>
        releaseProviderConnectStepResumes(
          providerConnectStepScope(agentId, sessionKey ?? null),
        );
      if (!path || !sessionKey) {
        releaseResumes();
        return false;
      }
      return sendInteractionReply(
        { text, mode: mode ?? turnMode, approvals, files },
        {
          resolvePin: resolveSendPin,
          save: (picked) => tauriAttachments.save(path, sessionKey, picked),
          send: (prompt, opts) =>
            tauriChat.send(path, prompt, sessionKey, opts),
          onSent: (sent) => {
            for (const f of sent)
              analytics.track("file_attached", {
                file_kind: classifyFileKind(f),
              });
            onSendReactivatedRef.current?.();
          },
          onFailed: (err) => {
            releaseResumes();
            showSendFailedToast(err);
          },
          onSentThrew: (err) =>
            logAndReportError("interaction_reply_handoff", err),
        },
      );
    },
    [agentId, path, sessionKey, turnMode, resolveSendPin, onSendReactivatedRef],
  );
}
