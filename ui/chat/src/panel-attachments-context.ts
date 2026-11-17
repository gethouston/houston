import { createContext, useContext } from "react";
import type { ChatPanelProps } from "./chat-panel-types";

/**
 * The ChatPanel's ONE attachment list, handed to whatever input is on screen.
 * A `composerOverride` that replaces the composer (an ask_user card) is then
 * the only place the user can see or add files, so it reads and writes this
 * same list: a file dropped anywhere on the panel shows up in the card, and
 * leaves with the card's answer instead of waiting for a later message.
 */
export interface PanelAttachments extends Pick<
  ChatPanelProps,
  | "prepareAttachments"
  | "onAttachmentRejections"
  | "onNotice"
  | "composerLabels"
> {
  files: File[];
  setFiles: (files: File[]) => void;
  /** Remove exactly the given File objects from the panel's CURRENT lists.
   *  A completion settles after its upload, when the card may be gone and
   *  the list may have grown, so it must never write back a snapshot. A
   *  no-op when the panel's `attachments` are controlled: the parent clears
   *  what it accepted. */
  releaseFiles: (sent: readonly File[]) => void;
  /** The panel's own drop intake, for a drop target inside the input. It
   *  merges into the list of the conversation this was rendered for, as that
   *  list stands when the drop resolves, so a drop that outlives its target
   *  never writes back the list the target last saw. */
  addDroppedFiles: (incoming: File[]) => void;
}

export const PanelAttachmentsContext = createContext<PanelAttachments | null>(
  null,
);

/** The enclosing ChatPanel's attachments, or `null` outside a ChatPanel. */
export function usePanelAttachments(): PanelAttachments | null {
  return useContext(PanelAttachmentsContext);
}
