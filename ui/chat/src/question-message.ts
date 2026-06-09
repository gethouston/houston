/**
 * Structured question / answer message markers.
 *
 * The agent asks via `<!--houston:question {...}-->` (anywhere in the
 * assistant reply; prose usually precedes the marker). The user answers
 * with `<!--houston:question-answer {...}-->` plus human-readable text.
 *
 * Parsing lives in `@houston-ai/chat` so any consumer can decode + render
 * the same cards without app-specific code.
 */

const QUESTION_MARKER_RE = /<!--houston:question (\{[\s\S]*?\})-->/;
const ANSWER_MARKER_RE =
  /^<!--houston:question-answer (\{[\s\S]*?\})-->\s*\n?\n?/;

export interface QuestionOption {
  id: string;
  label: string;
}

export interface QuestionPrompt {
  id: string;
  prompt: string;
  options: QuestionOption[];
  allowMultiple?: boolean;
  allowFreeText?: boolean;
}

export interface QuestionSpec {
  id: string;
  questions: QuestionPrompt[];
}

export interface QuestionAnswer {
  questionId: string;
  optionIds: string[];
  text?: string;
}

export interface QuestionAnswerSet {
  id: string;
  answers: QuestionAnswer[];
}

export interface DecodedQuestionMessage {
  spec: QuestionSpec;
  /** Body with the marker stripped so prose still renders. */
  content: string;
}

function normalizeQuestionSpec(
  payload: Partial<QuestionSpec> & Record<string, unknown>,
): QuestionSpec | null {
  if (typeof payload.id !== "string" || payload.id.trim() === "") return null;
  if (!Array.isArray(payload.questions) || payload.questions.length === 0) {
    return null;
  }
  const questions: QuestionPrompt[] = [];
  for (const raw of payload.questions) {
    if (!raw || typeof raw !== "object") return null;
    const q = raw as Partial<QuestionPrompt> & Record<string, unknown>;
    if (typeof q.id !== "string" || q.id.trim() === "") return null;
    if (typeof q.prompt !== "string" || q.prompt.trim() === "") return null;
    if (!Array.isArray(q.options)) return null;
    const options: QuestionOption[] = [];
    for (const opt of q.options) {
      if (!opt || typeof opt !== "object") return null;
      const o = opt as Partial<QuestionOption> & Record<string, unknown>;
      if (typeof o.id !== "string" || o.id.trim() === "") return null;
      if (typeof o.label !== "string" || o.label.trim() === "") return null;
      options.push({ id: o.id, label: o.label });
    }
    if (options.length === 0 && !q.allowFreeText) return null;
    questions.push({
      id: q.id,
      prompt: q.prompt,
      options,
      allowMultiple: q.allowMultiple === true,
      allowFreeText: q.allowFreeText === true,
    });
  }
  return { id: payload.id, questions };
}

function normalizeAnswerSet(
  payload: Partial<QuestionAnswerSet> & Record<string, unknown>,
): QuestionAnswerSet | null {
  if (typeof payload.id !== "string" || payload.id.trim() === "") return null;
  if (!Array.isArray(payload.answers)) return null;
  const answers: QuestionAnswer[] = [];
  for (const raw of payload.answers) {
    if (!raw || typeof raw !== "object") return null;
    const a = raw as Partial<QuestionAnswer> & Record<string, unknown>;
    if (typeof a.questionId !== "string" || a.questionId.trim() === "") {
      return null;
    }
    const optionIds = Array.isArray(a.optionIds)
      ? a.optionIds.filter((id): id is string => typeof id === "string")
      : [];
    answers.push({
      questionId: a.questionId,
      optionIds,
      text: typeof a.text === "string" ? a.text : undefined,
    });
  }
  if (answers.length === 0) return null;
  return { id: payload.id, answers };
}

/**
 * Extract a question spec from an assistant message. Returns stripped
 * content so the prose still renders. `null` when no valid marker.
 */
export function decodeQuestionMessage(body: string): DecodedQuestionMessage | null {
  const match = body.match(QUESTION_MARKER_RE);
  if (!match) return null;
  try {
    const payload = JSON.parse(match[1]) as Partial<QuestionSpec> &
      Record<string, unknown>;
    const spec = normalizeQuestionSpec(payload);
    if (!spec) return null;
    const content = body.replace(QUESTION_MARKER_RE, "").trim();
    return { spec, content };
  } catch {
    return null;
  }
}

export interface DecodedQuestionAnswerMessage {
  answerSet: QuestionAnswerSet;
  /** Human-readable text after the marker (shown to the user + model). */
  text: string;
}

/**
 * Extract a question-answer payload from a user message body.
 */
export function decodeQuestionAnswerMessage(
  body: string,
): DecodedQuestionAnswerMessage | null {
  const match = body.match(ANSWER_MARKER_RE);
  if (!match) return null;
  try {
    const payload = JSON.parse(match[1]) as Partial<QuestionAnswerSet> &
      Record<string, unknown>;
    const answerSet = normalizeAnswerSet(payload);
    if (!answerSet) return null;
    const text = body.slice(match[0].length).trim();
    return { answerSet, text };
  } catch {
    return null;
  }
}
