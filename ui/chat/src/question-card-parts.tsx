import { cn, Button } from "@houston-ai/core";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { QuestionPrompt, QuestionSpec } from "./question-message";
import type { QuestionDraft } from "./question-card-state";
export interface QuestionCardLabels {
  userInput?: string;
  awaitingResponse?: string;
  answered?: string;
  typeSomething?: string;
  submit?: string;
  next?: string;
  prev?: string;
  freeTextPlaceholder?: string;
}

export interface QuestionBodyLabels {
  typeSomething: string;
  freeTextPlaceholder: string;
}

export function OptionRow({
  index,
  label,
  selected,
  multiple,
  disabled,
  onSelect,
}: {
  index: number;
  label: string;
  selected: boolean;
  multiple: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
        selected ? "bg-secondary" : "hover:bg-secondary/60",
        disabled && "cursor-default opacity-80",
      )}
    >
      <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
        {index}
      </span>
      <span className="min-w-0 flex-1 text-sm text-foreground">{label}</span>
      {multiple && (
        <span
          className={cn(
            "mt-0.5 size-4 shrink-0 rounded border",
            selected ? "border-foreground bg-foreground" : "border-border",
          )}
        />
      )}
    </button>
  );
}

export function QuestionBody({
  question,
  draft,
  disabled,
  labels,
  onChange,
  onSingleOptionAnswered,
  onFreeTextCommit,
}: {
  question: QuestionPrompt;
  draft: QuestionDraft;
  disabled: boolean;
  labels: QuestionBodyLabels;
  onChange: (next: QuestionDraft) => void;
  /** Fired after a single-select option is chosen (parent may advance). */
  onSingleOptionAnswered?: () => void;
  /** Fired when free-text is committed via Enter or blur with content. */
  onFreeTextCommit?: () => void;
}) {
  const toggleOption = (optionId: string) => {
    if (disabled) return;
    if (question.allowMultiple) {
      const has = draft.optionIds.includes(optionId);
      onChange({
        ...draft,
        freeTextMode: false,
        optionIds: has
          ? draft.optionIds.filter((id) => id !== optionId)
          : [...draft.optionIds, optionId],
      });
      return;
    }
    onChange({
      optionIds: [optionId],
      text: "",
      freeTextMode: false,
    });
    onSingleOptionAnswered?.();
  };

  return (
    <div className="flex flex-col gap-1">
      <p className="mb-2 text-sm font-medium text-foreground">{question.prompt}</p>
      {question.options.map((opt, idx) => (
        <OptionRow
          key={opt.id}
          index={idx + 1}
          label={opt.label}
          selected={!draft.freeTextMode && draft.optionIds.includes(opt.id)}
          multiple={!!question.allowMultiple}
          disabled={disabled}
          onSelect={() => toggleOption(opt.id)}
        />
      ))}
      {question.allowFreeText && (
        <>
          <OptionRow
            index={0}
            label={labels.typeSomething}
            selected={draft.freeTextMode}
            multiple={false}
            disabled={disabled}
            onSelect={() =>
              onChange({ optionIds: [], text: draft.text, freeTextMode: true })
            }
          />
          {draft.freeTextMode && !disabled && (
            <input
              type="text"
              value={draft.text}
              onChange={(e) =>
                onChange({ ...draft, text: e.target.value, freeTextMode: true })
              }
              onBlur={() => {
                if (draft.text.trim()) onFreeTextCommit?.();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && draft.text.trim()) {
                  e.preventDefault();
                  onFreeTextCommit?.();
                }
              }}
              placeholder={labels.freeTextPlaceholder}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring"
            />
          )}
          {draft.freeTextMode && disabled && draft.text.trim() && (
            <p className="mt-1 px-3 text-sm text-foreground">{draft.text}</p>
          )}
        </>
      )}
    </div>
  );
}

export function QuestionCardFooter({
  spec,
  page,
  multiPage,
  answered,
  readOnly,
  currentComplete,
  complete,
  submitting,
  labels,
  onPageChange,
  onSubmit,
}: {
  spec: QuestionSpec;
  page: number;
  multiPage: boolean;
  answered: boolean;
  readOnly: boolean;
  currentComplete: boolean;
  complete: boolean;
  submitting: boolean;
  labels: Required<QuestionCardLabels>;
  onPageChange: (next: number) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="mt-4 flex items-center justify-between gap-3">
      {multiPage ? (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            disabled={page === 0 || readOnly}
            onClick={() => onPageChange(Math.max(0, page - 1))}
            aria-label={labels.prev}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <div className="flex items-center gap-1.5">
            {spec.questions.map((q, idx) => (
              <button
                key={q.id}
                type="button"
                disabled={readOnly}
                onClick={() => onPageChange(idx)}
                aria-label={`${idx + 1} / ${spec.questions.length}`}
                aria-current={idx === page ? "step" : undefined}
                className={cn(
                  "size-2 rounded-full transition-colors",
                  idx === page ? "bg-foreground" : "bg-border",
                  !readOnly && "hover:bg-foreground/60",
                )}
              />
            ))}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            disabled={
              page >= spec.questions.length - 1 || readOnly || !currentComplete
            }
            onClick={() =>
              onPageChange(Math.min(spec.questions.length - 1, page + 1))
            }
            aria-label={labels.next}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      ) : (
        <span />
      )}

      {!answered && (
        <div className="flex items-center gap-2">
          {multiPage && page < spec.questions.length - 1 ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={!currentComplete || readOnly}
              onClick={() =>
                onPageChange(Math.min(spec.questions.length - 1, page + 1))
              }
            >
              {labels.next}
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              disabled={!complete || readOnly}
              onClick={onSubmit}
            >
              {submitting ? "…" : labels.submit}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
