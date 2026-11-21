import type { AIBoardProps } from "@houston-ai/board";
import { useCallback } from "react";
import { ComposerContextMenu } from "./composer-context-menu";

type AttachMenu = AIBoardProps["attachMenu"];
type AttachMenuFn = Extract<AttachMenu, (ctx: never) => unknown>;

interface ContextCommandMenuArgs {
  base: AttachMenu;
  sessionKey: string;
  sendMessage: (
    sessionKey: string,
    text: string,
    files: File[],
  ) => Promise<void>;
  running: boolean;
}

export function useContextCommandMenu({
  base,
  sessionKey,
  sendMessage,
  running,
}: ContextCommandMenuArgs): AttachMenu {
  const sendCommand = useCallback(
    (text: string) => {
      sendMessage(sessionKey, text, []).then(undefined, () => {});
    },
    [sendMessage, sessionKey],
  );

  return useCallback<AttachMenuFn>(
    (ctx) => (
      <>
        {typeof base === "function" ? base(ctx) : base}
        <ComposerContextMenu
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
