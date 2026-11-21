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
