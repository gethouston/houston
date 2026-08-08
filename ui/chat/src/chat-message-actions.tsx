"use client";

import { cn } from "@houston-ai/core";
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
    // Revealed by pointer or keyboard: invisible at rest, shown while the
    // row (`group` on the Message container) is hovered OR holds focus — the
    // buttons stay in the DOM and the tab order, so keyboard users reach them
    // without a mouse (ChatGPT's grammar, chosen over the always-visible
    // default). Opacity-only, so the row's geometry never shifts.
    <MessageActions
      className={cn(
        "mt-1 opacity-0 transition-opacity duration-200 group-focus-within:opacity-100 group-hover:opacity-100",
        align === "end" ? "justify-end" : "justify-start",
      )}
      // The row's stable hook: these buttons carry ICONS, so anything asking
      // "does this message show a sender mark?" must exclude them.
      data-chat-message-actions=""
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
