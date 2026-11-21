import type { ChatMessage } from "./feed-to-messages";
import type { MessageAuthor } from "./types";

type AuthoredRow = Pick<ChatMessage, "from" | "author">;

export interface ChatAuthorLabels {
  you?: string;
}

function shortIdName(userId: string): string {
  return userId.slice(0, 8);
}

export function isOwnMessage(
  author: MessageAuthor | undefined,
  currentUserId: string | undefined,
): boolean {
  if (!author || !currentUserId) return true;
  return author.userId === currentUserId;
}

export function isPeerRow(
  message: AuthoredRow,
  currentUserId: string | undefined,
): boolean {
  return (
    message.from === "user" && !isOwnMessage(message.author, currentUserId)
  );
}

export function announcesSelfAuthorship(
  message: AuthoredRow,
  currentUserId: string | undefined,
  attributed: boolean,
): boolean {
  if (!attributed || message.from !== "user") return false;
  if (!message.author || !currentUserId) return false;
  return message.author.userId === currentUserId;
}

export function senderNameFor(
  author: MessageAuthor | undefined,
  currentUserId: string | undefined,
): string | null {
  if (!author || isOwnMessage(author, currentUserId)) return null;
  return author.name ?? shortIdName(author.userId);
}
