/**
 * Interactive structured-question card for in-chat agent prompts.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@houston-ai/core";
import { MessageCircle } from "lucide-react";
import { ChatStatusLine } from "./chat-status-line";
import type { QuestionAnswerSet, QuestionSpec } from "./question-message";
import {
  allDraftsComplete,
  buildAnswerSet,
  draftFromAnswer,
  emptyDraft,
  isDraftComplete,
  type QuestionDraft,
} from "./question-card-state";
import {
  QuestionBody,
  QuestionCardFooter,
  type QuestionCardLabels,
} from "./question-card-parts";

export type { QuestionCardLabels };

const DEFAULT_LABELS: Required<QuestionCardLabels> = {
  userInput: "User input",
  awaitingResponse: "AWAITING RESPONSE",
  answered: "ANSWERED",
  typeSomething: "Type something…",
  submit: "Submit",
  next: "Next",
  prev: "Previous",
  freeTextPlaceholder: "Your answer…",
};

export interface QuestionCardProps {
  spec: QuestionSpec;
  onSubmit: (answerSet: QuestionAnswerSet) => void;
  answered?: boolean;
  initialAnswers?: QuestionAnswerSet;
  submitting?: boolean;
  labels?: QuestionCardLabels;
}

export function QuestionCard({
  spec,
  onSubmit,
  answered = false,
  initialAnswers,
  submitting = false,
  labels,
}: QuestionCardProps) {
  const l = { ...DEFAULT_LABELS, ...labels };
  const [page, setPage] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, QuestionDraft>>(() => {
    const initial: Record<string, QuestionDraft> = {};
    for (const q of spec.questions) {
      const answer = initialAnswers?.answers.find((a) => a.questionId === q.id);
      initial[q.id] = draftFromAnswer(q, answer);
    }
    return initial;
  });

  useEffect(() => {
    if (!initialAnswers) return;
    const next: Record<string, QuestionDraft> = {};
    for (const q of spec.questions) {
      const answer = initialAnswers.answers.find((a) => a.questionId === q.id);
      next[q.id] = draftFromAnswer(q, answer);
    }
    setDrafts(next);
  }, [initialAnswers, spec.questions]);

  const question = spec.questions[page];
  const draft = drafts[question.id] ?? emptyDraft();
  const multiPage = spec.questions.length > 1;
  const complete = allDraftsComplete(spec, drafts);
  const currentComplete = isDraftComplete(question, draft);
  const readOnly = answered || submitting;

  const statusLabel = useMemo(
    () => (answered ? l.answered : l.awaitingResponse),
    [answered, l.answered, l.awaitingResponse],
  );

  const handleSubmit = () => {
    if (!complete || readOnly) return;
    onSubmit(buildAnswerSet(spec, drafts));
  };

  const advanceToNextQuestion = useCallback(() => {
    if (readOnly || answered) return;
    setPage((p) =>
      p < spec.questions.length - 1 ? p + 1 : p,
    );
  }, [answered, readOnly, spec.questions.length]);

  return (
    <div className="not-prose my-2 w-full max-w-2xl">
      <div className="rounded-xl border border-black/5 bg-background p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <MessageCircle className="size-3.5" />
            {l.userInput}
          </span>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 font-mono text-[10px] font-medium tracking-wide",
              answered
                ? "bg-emerald-50 text-emerald-700"
                : "bg-amber-50 text-amber-800",
            )}
          >
            {statusLabel}
          </span>
        </div>

        <QuestionBody
          question={question}
          draft={draft}
          disabled={readOnly}
          labels={l}
          onChange={(next) =>
            setDrafts((prev) => ({ ...prev, [question.id]: next }))
          }
          onSingleOptionAnswered={advanceToNextQuestion}
          onFreeTextCommit={advanceToNextQuestion}
        />

        <QuestionCardFooter
          spec={spec}
          page={page}
          multiPage={multiPage}
          answered={answered}
          readOnly={readOnly}
          currentComplete={currentComplete}
          complete={complete}
          submitting={submitting}
          labels={l}
          onPageChange={setPage}
          onSubmit={handleSubmit}
        />

        {!answered && (
          <ChatStatusLine
            label={l.awaitingResponse}
            active
            className="mt-3 text-muted-foreground/65"
          />
        )}
      </div>
    </div>
  );
}
