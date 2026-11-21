const MARKER_RE = /^<!--houston:interaction-answers (\{[\s\S]*?\})-->\s*\n?\n?/;

export interface InteractionAnswerLine {
  question?: string;
  answer: string;
}

export interface InteractionAnswersPayload {
  lines: InteractionAnswerLine[];
}

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
