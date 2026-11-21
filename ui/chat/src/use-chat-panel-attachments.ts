import { useCallback } from "react";
import type { ChatPanelProps } from "./chat-panel-types";
import type { MessageMention } from "./types";
import { ingestAttachments } from "./use-attachment-intake";
import { useDropErrorNotice } from "./use-drop-error-notice";
import { useFileDropZone } from "./use-file-drop-zone";
import { useSessionFiles } from "./use-session-files";

type AttachmentOptions = Pick<
  ChatPanelProps,
  | "sessionKey"
  | "onSend"
  | "attachments"
  | "onAttachmentsChange"
  | "prepareAttachments"
  | "onAttachmentRejections"
  | "onNotice"
  | "composerLabels"
>;

export function useChatPanelAttachments({
  sessionKey,
  onSend,
  attachments,
  onAttachmentsChange,
  prepareAttachments,
  onAttachmentRejections,
  onNotice,
  composerLabels,
}: AttachmentOptions) {
  const { files, setFiles, releaseFiles, ingestInto } = useSessionFiles(
    sessionKey,
    attachments,
    onAttachmentsChange,
  );
  const duplicateNotice = composerLabels?.fileAlreadyInChat;
  const tooManyNotice = composerLabels?.tooManyFiles;
  const addDroppedFiles = useCallback(
    (incoming: File[]) =>
      ingestInto(sessionKey, (current, write) =>
        ingestAttachments(
          {
            prepareAttachments,
            onAttachmentRejections,
            onNotice,
            duplicateNotice,
            tooManyNotice,
            files: current,
            setFiles: write,
          },
          incoming,
        ),
      ),
    [
      ingestInto,
      sessionKey,
      prepareAttachments,
      onAttachmentRejections,
      onNotice,
      duplicateNotice,
      tooManyNotice,
    ],
  );
  const onDropError = useDropErrorNotice(onNotice, composerLabels);
  const { isDraggingOver, dropProps } = useFileDropZone(
    addDroppedFiles,
    onDropError,
  );

  const handleSend = useCallback(
    async (text: string, sent: File[], mentions: MessageMention[]) => {
      await onSend(text, sent, mentions);
      releaseFiles(sent);
    },
    [onSend, releaseFiles],
  );

  return {
    files,
    setFiles,
    releaseFiles,
    addDroppedFiles,
    handleSend,
    isDraggingOver,
    dropProps,
  };
}
