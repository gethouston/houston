/**
 * The sender line above a message: who said this turn — a face (teammate photo
 * or initials) plus their name, or the agent's mark plus its name. Rendered
 * once per attributed row, mirroring the shared-chat anatomy: avatar leading,
 * name beside it, message body below.
 *
 * The avatar node itself is supplied by the consumer (`renderSenderAvatar`) so
 * the library stays free of profile lookups and agent-color resolution; a row
 * with no avatar shows the name alone.
 */

import { cn } from "@houston-ai/core";
import type { ReactNode } from "react";

interface ChatSenderHeaderProps {
  /** The sender's display name. Absent renders the avatar alone. */
  name?: string;
  /** The sender's avatar (person face / agent mark). Optional. */
  avatar?: ReactNode;
  /** A user row: the bubble is right-aligned, so the line mirrors to match. */
  isUser: boolean;
}

export function ChatSenderHeader({
  name,
  avatar,
  isUser,
}: ChatSenderHeaderProps) {
  return (
    <div
      className={cn(
        "mb-1 flex items-center gap-1.5 px-1",
        isUser && "flex-row-reverse",
      )}
    >
      {avatar ? <span className="flex shrink-0">{avatar}</span> : null}
      {name ? (
        <span className="truncate text-xs font-semibold text-ink">{name}</span>
      ) : null}
    </div>
  );
}
