"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatComposerLabels } from "./chat-panel-types";
import type { ChatInteractionAnswer } from "./interaction-card-logic";
import type { CardCompletion } from "./interaction-card-props";
import { usePanelAttachments } from "./panel-attachments-context";
import {
  isCompletionPending,
  markCompletionPending,
  settleCompletion,
  useCompletionPending,
} from "./pending-completions";
import {
  type ComposerAttachments,
  useComposerAttachments,
} from "./use-composer-attachments";
import { useDropErrorNotice } from "./use-drop-error-notice";

export interface CardAttach extends ComposerAttachments {
  labels?: ChatComposerLabels;
  addDroppedFiles: (incoming: File[]) => void;
  onDropError: (error: unknown) => void;
}

export function useCardAttachments(
  onComplete: CardCompletion,
  completionKey?: string,
): {
  attach: CardAttach | null;
  complete: (answers: ChatInteractionAnswer[]) => void;
  pending: boolean;
} {
  const panel = usePanelAttachments();
  const composer = useComposerAttachments({
    attachments: panel?.files,
    onAttachmentsChange: panel?.setFiles,
    prepareAttachments: panel?.prepareAttachments,
    onAttachmentRejections: panel?.onAttachmentRejections,
    onNotice: panel?.onNotice,
    labels: panel?.composerLabels,
  });
  const onDropError = useDropErrorNotice(
    panel?.onNotice,
    panel?.composerLabels,
  );
  const latest = useRef(panel);
  useEffect(() => {
    latest.current = panel;
  });
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const [ownKey] = useState(() => Symbol("card-completion"));
  const key = completionKey ?? ownKey;
  const pending = useCompletionPending(key);

  const complete = useCallback(
    (answers: ChatInteractionAnswer[]) => {
      if (isCompletionPending(key)) return;
      const current = alive.current ? latest.current : null;
      const files = answers.length > 0 ? [...(current?.files ?? [])] : [];
      const result = onComplete(answers, files);
      if (!(result instanceof Promise)) {
        current?.releaseFiles(files);
        return;
      }
      markCompletionPending(key);
      const settle = (accepted: boolean) => {
        settleCompletion(key);
        if (accepted) current?.releaseFiles(files);
      };
      void result.then(settle, (err: unknown) => {
        settle(false);
        throw err;
      });
    },
    [key, onComplete],
  );
  return {
    attach: panel
      ? {
          ...composer,
          labels: panel.composerLabels,
          addDroppedFiles: panel.addDroppedFiles,
          onDropError,
        }
      : null,
    complete,
    pending,
  };
}
