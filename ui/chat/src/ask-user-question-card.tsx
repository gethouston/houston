/**
 * `<AskUserQuestionCard>` — interactive UI for the `mcp__houston__AskUserQuestion`
 * tool. Renders the agent's structured question(s) as radio chips
 * (`multiSelect: false`) or checkboxes (`multiSelect: true`), plus an "Other"
 * free-text input that's always present (matches Conductor convention — the
 * tool docstring tells the LLM not to include "Other" in its options).
 *
 * Library-pure: no engine-client import, no i18n hook, no app-state coupling.
 * The app passes `onSubmit` (which POSTs to `/v1/agents/.../user_input`) and
 * a `labels` object built from `t(...)`. English defaults render correctly
 * if labels is omitted, so the component is also usable standalone.
 *
 * Keyboard:
 * - `Tab` / `Shift+Tab` between questions and the submit button (browser default).
 * - `↑` / `↓` between options within a question.
 * - `Space` / `Enter` toggles the focused option.
 * - `⌘↩` / `Ctrl+↩` submits if at least one answer is filled.
 * - `Esc` clears the form (does NOT cancel the underlying tool call —
 *    the engine's MCP handler stays blocked until a real answer arrives).
 */

"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { cn } from "@houston-ai/core";

/**
 * One question in the tool's input. Mirrors the Rust shape in
 * `engine/houston-engine-server/src/routes/mcp.rs::handle_tools_list`.
 */
export interface AskUserQuestion {
  question: string;
  options: string[];
  multiSelect?: boolean;
}

/**
 * The answer shape posted back to the engine. The engine wraps this verbatim
 * as the MCP tool result, so the LLM sees it in tool_result. One entry per
 * question in the same order.
 */
export interface AskUserQuestionAnswer {
  answers: Array<{
    /** Selected option labels (or [] if only "Other" was filled). */
    selected: string[];
    /** Free-text "Other" content, or undefined if the user didn't fill it. */
    other?: string;
  }>;
}

export interface AskUserQuestionLabels {
  /** Button text in idle state. */
  submit?: string;
  /** Button text while the POST is in flight. */
  submitting?: string;
  /** Label on the trailing free-text input. */
  other?: string;
  /** Placeholder on the trailing free-text input. */
  otherPlaceholder?: string;
  /** Helper text above a single-select question's options. */
  selectOne?: string;
  /** Helper text above a multi-select question's options. */
  selectMany?: string;
  /** Heading on the read-only "answered" view. */
  answered?: string;
}

const DEFAULT_LABELS: Required<AskUserQuestionLabels> = {
  submit: "Submit",
  submitting: "Submitting...",
  other: "Other",
  otherPlaceholder: "Type your answer",
  selectOne: "Choose one",
  selectMany: "Choose one or more",
  answered: "Answered",
};

export interface AskUserQuestionCardProps {
  /** The LLM-emitted id we POST back as `tool_use_id`. */
  toolUseId: string;
  /** Questions from the tool_use input payload. */
  questions: AskUserQuestion[];
  /**
   * Called when the user clicks submit. The promise resolves once the
   * POST has been accepted (the answer then flows back to the agent
   * out-of-band through the MCP HTTP response). Errors are surfaced
   * inline on the card.
   */
  onSubmit: (answer: AskUserQuestionAnswer) => Promise<void>;
  /**
   * If set, the card renders read-only — used when displaying a
   * previously-answered question from chat history.
   */
  answered?: AskUserQuestionAnswer;
  labels?: AskUserQuestionLabels;
}

interface QuestionState {
  selected: Set<string>;
  other: string;
}

function freshState(questions: AskUserQuestion[]): QuestionState[] {
  return questions.map(() => ({ selected: new Set<string>(), other: "" }));
}

export const AskUserQuestionCard = memo(function AskUserQuestionCard({
  toolUseId,
  questions,
  onSubmit,
  answered,
  labels,
}: AskUserQuestionCardProps) {
  const l = useMemo(() => ({ ...DEFAULT_LABELS, ...labels }), [labels]);

  if (answered) {
    return <AnsweredView questions={questions} answered={answered} label={l.answered} />;
  }

  return (
    <PendingForm
      toolUseId={toolUseId}
      questions={questions}
      onSubmit={onSubmit}
      labels={l}
    />
  );
});

// ---------------------------------------------------------------------------
// Pending — interactive form
// ---------------------------------------------------------------------------

function PendingForm({
  toolUseId,
  questions,
  onSubmit,
  labels,
}: {
  toolUseId: string;
  questions: AskUserQuestion[];
  onSubmit: AskUserQuestionCardProps["onSubmit"];
  labels: Required<AskUserQuestionLabels>;
}) {
  const [state, setState] = useState<QuestionState[]>(() => freshState(questions));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cardRef = useRef<HTMLFormElement | null>(null);

  // Reset internal state if the agent re-uses the card with a new tool_use_id
  // (a new question came in for the same session).
  useEffect(() => {
    setState(freshState(questions));
    setSubmitting(false);
    setError(null);
  }, [toolUseId, questions]);

  const hasAtLeastOneAnswer = state.some(
    (q) => q.selected.size > 0 || q.other.trim().length > 0,
  );

  const toggleOption = useCallback(
    (qIdx: number, option: string, multiSelect: boolean | undefined) => {
      setState((prev) => {
        const next = prev.map((q) => ({ selected: new Set(q.selected), other: q.other }));
        const slot = next[qIdx];
        if (multiSelect) {
          if (slot.selected.has(option)) slot.selected.delete(option);
          else slot.selected.add(option);
        } else {
          if (slot.selected.has(option)) {
            slot.selected.clear();
          } else {
            slot.selected.clear();
            slot.selected.add(option);
          }
        }
        return next;
      });
    },
    [],
  );

  const setOther = useCallback((qIdx: number, value: string) => {
    setState((prev) => prev.map((q, i) => (i === qIdx ? { ...q, other: value } : q)));
  }, []);

  const submit = useCallback(async () => {
    if (submitting || !hasAtLeastOneAnswer) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        answers: state.map((q) => {
          const selected = Array.from(q.selected);
          const other = q.other.trim();
          return other ? { selected, other } : { selected };
        }),
      });
      // On success the engine will emit a tool_result FeedItem and the parent
      // re-renders with `answered` set. We don't reset state here — the
      // re-render replaces this component with `AnsweredView`.
    } catch (err) {
      setSubmitting(false);
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [submitting, hasAtLeastOneAnswer, onSubmit, state]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLFormElement>) => {
      // ⌘↩ / Ctrl+↩ → submit (anywhere in the form, including inside textboxes).
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        void submit();
        return;
      }
      // Esc → clear the form (a stale-state escape valve for keyboard users).
      if (e.key === "Escape") {
        e.preventDefault();
        setState(freshState(questions));
        setError(null);
      }
    },
    [questions, submit],
  );

  return (
    <form
      ref={cardRef}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      onKeyDown={handleKeyDown}
      className={cn(
        "rounded-xl border border-border bg-card text-card-foreground",
        "p-4 space-y-4 not-prose",
      )}
      aria-label="Agent question"
    >
      {questions.map((q, qIdx) => (
        <QuestionBlock
          key={qIdx}
          question={q}
          state={state[qIdx]}
          onToggle={(option) => toggleOption(qIdx, option, q.multiSelect)}
          onOtherChange={(v) => setOther(qIdx, v)}
          labels={labels}
        />
      ))}

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="submit"
          disabled={!hasAtLeastOneAnswer || submitting}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium",
            "bg-primary text-primary-foreground",
            "transition-opacity",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            "hover:opacity-90",
          )}
        >
          {submitting ? labels.submitting : labels.submit}
        </button>
      </div>
    </form>
  );
}

function QuestionBlock({
  question,
  state,
  onToggle,
  onOtherChange,
  labels,
}: {
  question: AskUserQuestion;
  state: QuestionState;
  onToggle: (option: string) => void;
  onOtherChange: (value: string) => void;
  labels: Required<AskUserQuestionLabels>;
}) {
  const groupRef = useRef<HTMLDivElement | null>(null);
  const multiSelect = !!question.multiSelect;
  const groupRole = multiSelect ? undefined : "radiogroup";
  const helperText = multiSelect ? labels.selectMany : labels.selectOne;

  // ↑ / ↓ keyboard navigation between options within the same question.
  const handleArrowKeys = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    const buttons = Array.from(
      groupRef.current?.querySelectorAll<HTMLButtonElement>("button[data-option]") ?? [],
    );
    if (buttons.length === 0) return;
    const current = buttons.findIndex((b) => b === document.activeElement);
    const dir = e.key === "ArrowDown" ? 1 : -1;
    const next = current < 0 ? 0 : (current + dir + buttons.length) % buttons.length;
    buttons[next]?.focus();
    e.preventDefault();
  }, []);

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground">{question.question}</p>
      <p className="text-xs text-muted-foreground">{helperText}</p>
      <div
        ref={groupRef}
        role={groupRole}
        onKeyDown={handleArrowKeys}
        className="space-y-1.5"
      >
        {question.options.map((option) => {
          const checked = state.selected.has(option);
          return (
            <button
              key={option}
              type="button"
              data-option
              role={multiSelect ? "checkbox" : "radio"}
              aria-checked={checked}
              onClick={() => onToggle(option)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-md border px-3 py-2",
                "text-sm text-left transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                checked
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-background hover:bg-muted/50",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "shrink-0 size-4 border flex items-center justify-center",
                  multiSelect ? "rounded-sm" : "rounded-full",
                  checked
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-muted-foreground/40 bg-transparent",
                )}
              >
                {checked && (multiSelect ? <CheckGlyph /> : <DotGlyph />)}
              </span>
              <span className="min-w-0 flex-1">{option}</span>
            </button>
          );
        })}
      </div>
      <label className="block space-y-1.5 pt-1">
        <span className="text-xs text-muted-foreground">{labels.other}</span>
        <input
          type="text"
          value={state.other}
          onChange={(e) => onOtherChange(e.target.value)}
          placeholder={labels.otherPlaceholder}
          className={cn(
            "w-full rounded-md border border-border bg-background",
            "px-3 py-2 text-sm",
            "placeholder:text-muted-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        />
      </label>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Answered — read-only view (history reload, or moments after submit)
// ---------------------------------------------------------------------------

function AnsweredView({
  questions,
  answered,
  label,
}: {
  questions: AskUserQuestion[];
  answered: AskUserQuestionAnswer;
  label: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border/60 bg-card/60 text-card-foreground",
        "p-4 space-y-3 not-prose",
      )}
      aria-label="Answered question"
    >
      <p className="text-xs uppercase tracking-wide text-muted-foreground/70">{label}</p>
      {questions.map((q, qIdx) => {
        const slot = answered.answers[qIdx];
        const picks = slot?.selected ?? [];
        const other = slot?.other ?? "";
        const summary = [...picks, ...(other ? [other] : [])].join(", ");
        return (
          <div key={qIdx} className="space-y-1">
            <p className="text-sm font-medium text-foreground">{q.question}</p>
            <p className="text-sm text-muted-foreground">
              {summary || "(no answer)"}
            </p>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Glyphs
// ---------------------------------------------------------------------------

function CheckGlyph() {
  return (
    <svg viewBox="0 0 16 16" className="size-3" fill="none">
      <path
        d="M3.5 8.5l3 3 6-6.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DotGlyph() {
  return <span className="size-1.5 rounded-full bg-current" aria-hidden />;
}
