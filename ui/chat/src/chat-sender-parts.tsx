/**
 * The three pieces a shared conversation uses to say who is talking (HOU-960),
 * kept together because they share one visual rule: a small semibold name in
 * that sender's own colour.
 *
 * - `ChatSenderName` — the name itself. A teammate wears the tone hashed from
 *   their user id; the agent wears its avatar colour. The class comes IN from
 *   the consumer (the same seam as `renderSenderAvatar`) so this package stays
 *   free of palette and profile knowledge.
 * - `ChatSenderHeader` — the AGENT's line above its prose: mark then name. The
 *   agent has no bubble to put a name inside.
 * - `ChatPeerRow` — a teammate's row: a fixed avatar column then the bubble.
 *   The column is rendered even when the face is omitted (every message of a
 *   run after the first) so consecutive bubbles line up under the face instead
 *   of stepping left.
 */

import { cn } from "@houston-ai/core";
import type { ReactNode } from "react";

/** Matches the 20px teammate face + agent mark, so a bubble's left edge sits
 *  the same distance in whether or not this row shows a face. */
const FACE_COLUMN = "w-5 shrink-0";

interface ChatSenderNameProps {
  /** The sender's display name. */
  name: string;
  /** Tailwind text-colour utility for this sender's tone. Absent = plain ink. */
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

interface ChatSenderHeaderProps {
  /** The agent's display name. Absent renders the mark alone. */
  name?: string;
  /** The agent's mark. Optional. */
  avatar?: ReactNode;
  /** Tailwind text-colour utility for the agent's own colour. */
  toneClass?: string;
}

export function ChatSenderHeader({
  name,
  avatar,
  toneClass,
}: ChatSenderHeaderProps) {
  return (
    <div className="mb-1 flex min-w-0 items-center gap-1.5 px-1">
      {avatar ? (
        <span className={cn("flex", FACE_COLUMN)}>{avatar}</span>
      ) : null}
      {name ? <ChatSenderName name={name} toneClass={toneClass} /> : null}
    </div>
  );
}

interface ChatPeerRowProps {
  /** The teammate's face, or `null` on a continuation row (space is kept). */
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
