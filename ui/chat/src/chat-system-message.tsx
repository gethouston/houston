import type { ReactNode } from "react";
import type { ChatMessage } from "./feed-to-messages";

interface ChatSystemMessageProps {
  message: ChatMessage;
  renderSystemMessage?: (msg: ChatMessage) => ReactNode | undefined;
  contextCompactedLabel?: string;
}

export function ChatSystemMessage({
  message,
  renderSystemMessage,
  contextCompactedLabel,
}: ChatSystemMessageProps) {
  const custom = renderSystemMessage?.(message);
  if (custom !== undefined) return <div key={message.key}>{custom}</div>;
  if (message.hostCard) return null;
  if (message.compaction) {
    const label =
      message.compaction.kind === "context_cleared"
        ? "Context cleared"
        : (contextCompactedLabel ??
          "Earlier conversation summarized to free up space");
    return (
      <div className="flex items-center gap-3 max-w-3xl mx-auto px-4 py-3 text-ink-muted/70">
        <div className="h-px flex-1 bg-line/60" />
        <span className="text-xs italic whitespace-nowrap">{label}</span>
        <div className="h-px flex-1 bg-line/60" />
      </div>
    );
  }
  return (
    <div className="flex justify-center py-2">
      <span className="text-xs text-ink-muted/60 italic">
        {message.content}
      </span>
    </div>
  );
}
