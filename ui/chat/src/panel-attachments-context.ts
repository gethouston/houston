import { createContext, useContext } from "react";
import type { ChatPanelProps } from "./chat-panel-types";

export interface PanelAttachments
  extends Pick<
    ChatPanelProps,
    | "prepareAttachments"
    | "onAttachmentRejections"
    | "onNotice"
    | "composerLabels"
  > {
  files: File[];
  setFiles: (files: File[]) => void;
  releaseFiles: (sent: readonly File[]) => void;
  addDroppedFiles: (incoming: File[]) => void;
}

export const PanelAttachmentsContext = createContext<PanelAttachments | null>(
  null,
);

export function usePanelAttachments(): PanelAttachments | null {
  return useContext(PanelAttachmentsContext);
}
