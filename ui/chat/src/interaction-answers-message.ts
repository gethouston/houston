const MARKER_RE = /^<!--houston:interaction-answers (\{[\s\S]*?\})-->\s*\n?\n?/;

export interface InteractionAnswerLine {
  /**
   * The question text, or undefined for a non-question line (a connected app, a
   * signin confirmation) which renders as a single bold line with no muted
   * question line above it.
   */
  question?: string;
  /** The answer / confirmation text, always present. */
  answer: string;
}

export interface InteractionAnswersPayload {
  lines: InteractionAnswerLine[];
}

/**
 * Try to extract an interaction-answers payload from a user-message body.
 * Returns `null` when the message is plain text or the marker JSON is
 * malformed. Individual malformed entries (missing/non-string `answer`) are
 * dropped rather than failing the whole decode; if no valid entries remain the
 * whole decode returns `null` so the caller falls through to plain text.
 */
export function decodeInteractionAnswersMessage(
  body: string,
): InteractionAnswersPayload | null {
  const match = body.match(MARKER_RE);
  if (!match) return null;
  try {
    const payload = JSON.parse(match[1]) as Partial<InteractionAnswersPayload> &
      Record<string, unknown>;
    if (!Array.isArray(payload?.lines)) return null;
    const lines: InteractionAnswerLine[] = [];
    for (const raw of payload.lines) {
      if (!raw || typeof raw !== "object") continue;
      const entry = raw as Partial<InteractionAnswerLine>;
      if (typeof entry.answer !== "string") continue;
      lines.push(
        typeof entry.question === "string"
          ? { question: entry.question, answer: entry.answer }
          : { answer: entry.answer },
      );
    }
    if (lines.length === 0) return null;
    return { lines };
  } catch {
    return null;
  }
}
