/**
 * Message attribution for multiplayer conversations (C5).
 *
 * Two pure concerns, both unit-tested without a live pi session or a network:
 *
 *  1. `decodeActingAuthor` — read WHO a turn is acting as off the C2 acting-as
 *     token's payload. The token is `acting-v1.<payloadB64Url>.<sigB64Url>`; the
 *     gateway already VERIFIED the signature before forwarding, so the runtime
 *     only READS the middle segment ({sub, name, agent, exp}). We deliberately
 *     do NOT re-verify here — the runtime holds no `GW_HOST_TOKEN_SECRET` and the
 *     trust boundary is the gateway. A garbled/absent token yields `undefined`,
 *     so a single-user / local turn stamps no author (byte-identical to today).
 *
 *  2. `framePrompt` — the model-facing framing rule. Only when THIS turn has an
 *     author AND the conversation already holds a user message from a DIFFERENT
 *     author does the runtime prefix the prompt with `[From: <name>]\n`, so the
 *     model can tell teammates apart. Single-author conversations are never
 *     prefixed — today's prompts stay byte-identical (no drift; the dual-profile
 *     parity test stays green).
 */

/** WHO wrote a user message, as persisted on the v3 conversation record (C5). */
export interface MessageAuthor {
  userId: string;
  name?: string;
}

/** The C2 acting-as token payload the runtime reads (a superset is fine). */
interface ActingPayload {
  sub?: unknown;
  name?: unknown;
}

/**
 * Decode the acting-as token's payload into a `MessageAuthor`, or `undefined`
 * when there is no token or it can't be read. NO signature verification — the
 * gateway verified it; the runtime is just reading who it was minted for.
 */
export function decodeActingAuthor(
  actingAs: string | undefined,
): MessageAuthor | undefined {
  if (!actingAs) return undefined;
  // `acting-v1.<payloadB64Url>.<sigB64Url>` — the payload is the middle segment.
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

/** The label a `[From: …]` prefix uses: the display name, else a short userId. */
function authorLabel(author: MessageAuthor): string {
  if (author.name) return author.name;
  // No name: a short, stable prefix of the userId keeps the frame readable
  // without dumping a full opaque sub into the prompt.
  return author.userId.slice(0, 8);
}

/**
 * Whether a turn by `author` should be model-framed given the conversation's
 * prior user authors. True only when this turn HAS an author AND at least one
 * earlier user message came from a DIFFERENT author (by userId). Pure so the
 * decision is unit-tested directly.
 */
export function shouldFrame(
  author: MessageAuthor | undefined,
  priorAuthors: ReadonlyArray<MessageAuthor | undefined>,
): boolean {
  if (!author) return false;
  return priorAuthors.some((a) => a && a.userId !== author.userId);
}

/**
 * The prompt text handed to the model for this turn: the raw `text`, prefixed
 * with `[From: <name-or-userId-prefix>]\n` ONLY when `shouldFrame` says so.
 * Single-author (or authorless) turns return `text` unchanged.
 */
export function framePrompt(
  text: string,
  author: MessageAuthor | undefined,
  priorAuthors: ReadonlyArray<MessageAuthor | undefined>,
): string {
  if (!shouldFrame(author, priorAuthors)) return text;
  // `author` is defined here (shouldFrame returned true).
  return `[From: ${authorLabel(author as MessageAuthor)}]\n${text}`;
}
