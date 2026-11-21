"use client";

import { cn } from "@houston-ai/core";
import { Check, Copy, Pencil } from "lucide-react";
import { useEffect, useState } from "react";
import { MessageAction, MessageActions } from "./ai-elements/message";
import { copyTextToClipboard } from "./clipboard";
import type { ChatMessage } from "./feed-to-messages";

const COPY_RESET_MS = 1600;

export function ChatMessageActionsRow({
  message,
  align,
  copyable,
  copyMessageLabel,
  onEditMessage,
  editMessageLabel,
}: {
  message: ChatMessage;
  align: "start" | "end";
  copyable: boolean;
  copyMessageLabel?: string;
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
      className={cn(
        "mt-1 opacity-0 transition-opacity duration-200 group-focus-within:opacity-100 group-hover:opacity-100",
        align === "end" ? "justify-end" : "justify-start",
      )}
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
