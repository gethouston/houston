import { cn } from "@houston-ai/core";
import type { ReactNode } from "react";

const FACE_COLUMN = "w-8 shrink-0";

interface ChatSenderNameProps {
  name: string;
  toneClass?: string;
}

export function ChatSenderName({ name, toneClass }: ChatSenderNameProps) {
  return (
    <span
      className={cn(
        "block truncate text-xs font-semibold",
        toneClass ?? "text-ink",
      )}
      data-chat-sender-name=""
    >
      {name}
    </span>
  );
}

interface ChatPeerRowProps {
  face: ReactNode;
  children: ReactNode;
}

export function ChatPeerRow({ face, children }: ChatPeerRowProps) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      <span className={cn("flex", FACE_COLUMN)}>{face}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
