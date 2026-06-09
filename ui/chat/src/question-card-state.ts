import type {
  QuestionAnswer,
  QuestionAnswerSet,
  QuestionPrompt,
  QuestionSpec,
} from "./question-message";

export interface QuestionDraft {
  optionIds: string[];
  text: string;
  freeTextMode: boolean;
}

export function emptyDraft(): QuestionDraft {
  return { optionIds: [], text: "", freeTextMode: false };
}

export function draftFromAnswer(
  question: QuestionPrompt,
  answer: QuestionAnswer | undefined,
): QuestionDraft {
  if (!answer) return emptyDraft();
  const hasFreeText = !!answer.text?.trim();
  const optionIds = answer.optionIds.filter((id) =>
    question.options.some((o) => o.id === id),
  );
  if (hasFreeText && optionIds.length === 0) {
    return { optionIds: [], text: answer.text ?? "", freeTextMode: true };
  }
  return {
    optionIds,
    text: answer.text ?? "",
    freeTextMode: false,
  };
}

export function isDraftComplete(
  question: QuestionPrompt,
  draft: QuestionDraft,
): boolean {
  if (draft.freeTextMode) {
    return draft.text.trim().length > 0;
  }
  if (draft.optionIds.length === 0) return false;
  if (question.allowMultiple) return true;
  return draft.optionIds.length === 1;
}

export function buildAnswerSet(
  spec: QuestionSpec,
  drafts: Record<string, QuestionDraft>,
): QuestionAnswerSet {
  const answers: QuestionAnswer[] = spec.questions.map((q) => {
    const draft = drafts[q.id] ?? emptyDraft();
    if (draft.freeTextMode) {
      return {
        questionId: q.id,
        optionIds: [],
        text: draft.text.trim(),
      };
    }
    return {
      questionId: q.id,
      optionIds: [...draft.optionIds],
      text: draft.text.trim() || undefined,
    };
  });
  return { id: spec.id, answers };
}

export function allDraftsComplete(
  spec: QuestionSpec,
  drafts: Record<string, QuestionDraft>,
): boolean {
  return spec.questions.every((q) =>
    isDraftComplete(q, drafts[q.id] ?? emptyDraft()),
  );
}

/** Single-select picks advance immediately; multi-select waits for Next. */
export function autoAdvancesOnOptionPick(question: QuestionPrompt): boolean {
  return !question.allowMultiple;
}
