import type { AIBoardProps } from "@houston-ai/board";
import { useCallback } from "react";
import { ComposerContextMenu } from "./composer-context-menu";

type AttachMenu = AIBoardProps["attachMenu"];
type AttachMenuFn = Extract<AttachMenu, (ctx: never) => unknown>;

interface ContextCommandMenuArgs {
  /** The chat panel's own attach menu, kept above the command entries. */
  base: AttachMenu;
  sessionKey: string;
  sendMessage: (
    sessionKey: string,
    text: string,
    files: File[],
  ) => Promise<void>;
  /** Whether a turn is in flight for this conversation. */
  running: boolean;
}

/**
 * Compose the conversation-command entries onto a chat's "+" menu.
 *
 * The commands are sent as plain messages through the surface's ordinary send,
 * so everything a normal send gets — the warming queue, the failure toast, the
 * queued bubble — applies unchanged, and the runtime is the only place that
 * knows what `/clear` means.
 */
export function useContextCommandMenu({
  base,
  sessionKey,
  sendMessage,
  running,
}: ContextCommandMenuArgs): AttachMenu {
  const sendCommand = useCallback(
    (text: string) => {
      sendMessage(sessionKey, text, []).then(undefined, () => {
        // The send path already showed the user a toast and reported the
        // failure (showSendFailedToast); this handler exists so the rejection
        // does not escape unhandled, and deliberately adds nothing.
      });
    },
    [sendMessage, sessionKey],
  );

  return useCallback<AttachMenuFn>(
    (ctx) => (
      <>
        {typeof base === "function" ? base(ctx) : base}
        <ComposerContextMenu
          // Nothing to compact or clear in an empty chat. Mid-turn the send
          // queue would hold the command and flush it merged with whatever else
          // was queued, which would stop it being the exact text the runtime
          // recognizes, so it waits for the turn instead.
          enabled={ctx.hasMessages && !running}
          onCommand={(text) => {
            ctx.close();
            sendCommand(text);
          }}
        />
      </>
    ),
    [base, running, sendCommand],
  );
}
