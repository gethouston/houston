"use client";

import { Check, Copy, Pencil } from "lucide-react";
import { useEffect, useState } from "react";
import { MessageAction, MessageActions } from "./ai-elements/message";
import { copyTextToClipboard } from "./clipboard";
import type { ChatMessage } from "./feed-to-messages";

const COPY_RESET_MS = 1600;

/**
 * The per-message action row (PRODUCT-1217): rendered under a settled bubble,
 * always visible — hover only enhances, never gates. Copy is offered on both
 * sides of the conversation (a user turn's plain text, an agent turn's
 * markdown source, verbatim); Edit only on the viewer's own user rows, wired
 * by the consumer. Renders nothing when neither action applies, so rows
 * without actions keep their exact geometry.
 */
export function ChatMessageActionsRow({
  message,
  align,
  copyable,
  copyMessageLabel,
  onEditMessage,
  editMessageLabel,
}: {
  message: ChatMessage;
  /** Which bubble edge the row hugs: the viewer's own rows sit on the RIGHT
   *  side of the thread (`end`); agent + teammate rows are left-aligned
   *  (`start`). Passed in because side is a row-level fact (peer mirroring),
   *  not derivable from `message.from` alone. */
  align: "start" | "end";
  copyable: boolean;
  copyMessageLabel?: string;
  /** Present = the Edit affordance renders (the item already gated the row). */
  onEditMessage?: (msg: ChatMessage) => void;
  editMessageLabel?: string;
}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), COPY_RESET_MS);
    return () => window.clearTimeout(timer);
  }, [copied]);

  if (!copyable && !onEditMessage) return null;
  const copyLabel = copyMessageLabel ?? "Copy message";
  const editLabel = editMessageLabel ?? "Edit message";
  return (
    <MessageActions
      className={align === "end" ? "mt-1 justify-end" : "mt-1 justify-start"}
    >
      {copyable ? (
        <MessageAction
          className="text-ink-muted hover:text-ink"
          label={copyLabel}
          onClick={() => {
            void copyTextToClipboard(message.content).then(() =>
              setCopied(true),
            );
          }}
          tooltip={copyLabel}
        >
          {copied ? (
            <Check className="h-4 w-4" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </MessageAction>
      ) : null}
      {onEditMessage ? (
        <MessageAction
          className="text-ink-muted hover:text-ink"
          label={editLabel}
          onClick={() => onEditMessage(message)}
          tooltip={editLabel}
        >
          <Pencil className="h-4 w-4" />
        </MessageAction>
      ) : null}
    </MessageActions>
  );
}
