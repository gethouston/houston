export interface MessageAuthor {
  userId: string;
  name?: string;
}

interface ActingPayload {
  sub?: unknown;
  name?: unknown;
}

export function decodeActingAuthor(
  actingAs: string | undefined,
): MessageAuthor | undefined {
  if (!actingAs) return undefined;
  const segments = actingAs.split(".");
  if (segments.length < 2) return undefined;
  const payloadSegment = segments[1];
  if (!payloadSegment) return undefined;
  try {
    const payload = JSON.parse(
      Buffer.from(payloadSegment, "base64url").toString("utf8"),
    ) as ActingPayload;
    if (typeof payload.sub !== "string" || payload.sub.length === 0) {
      return undefined;
    }
    const name =
      typeof payload.name === "string" && payload.name.length > 0
        ? payload.name
        : undefined;
    return name ? { userId: payload.sub, name } : { userId: payload.sub };
  } catch {
    return undefined;
  }
}

function authorLabel(author: MessageAuthor): string {
  if (author.name) return author.name;
  return author.userId.slice(0, 8);
}

export function shouldFrame(
  author: MessageAuthor | undefined,
  priorAuthors: ReadonlyArray<MessageAuthor | undefined>,
): boolean {
  if (!author) return false;
  return priorAuthors.some((a) => a && a.userId !== author.userId);
}

export function framePrompt(
  text: string,
  author: MessageAuthor | undefined,
  priorAuthors: ReadonlyArray<MessageAuthor | undefined>,
): string {
  if (!shouldFrame(author, priorAuthors)) return text;
  return `[From: ${authorLabel(author as MessageAuthor)}]\n${text}`;
}
