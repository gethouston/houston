import { Button, cn } from "@houston-ai/core";
import { useLayoutEffect, useRef, useState } from "react";

export interface CommentFormLabels {
  placeholder: string;
  cancel: string;
  add: string;
  save: string;
  remove: string;
  /** The submit shortcut, as the platform writes it ("⌘↵", "Ctrl+↵"). */
  shortcut: string;
  /** Shown once the comment reaches `maxLength`. */
  tooLong?: string;
}

export interface CommentFormProps {
  /** "Slide 3 · “quote”": what the comment is about. */
  context: string;
  initial: string;
  editing: boolean;
  labels: CommentFormLabels;
  /** `keyboard`: the action came from a key, so nothing animates. */
  onSubmit: (comment: string, keyboard: boolean) => void;
  onCancel: (keyboard: boolean) => void;
  onRemove?: () => void;
  /** Phone sheet: full-width 44px buttons. */
  roomy?: boolean;
  /** Characters a comment may hold. */
  maxLength?: number;
}

/** Ask what the agent should change about a selection. */
export function CommentForm({
  context,
  initial,
  editing,
  labels,
  onSubmit,
  onCancel,
  onRemove,
  roomy,
  maxLength,
}: CommentFormProps) {
  const [comment, setComment] = useState(initial);
  const area = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight + 2, 160)}px`;
  });
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(comment, false);
      }}
    >
      <p className="truncate text-xs text-ink-muted">{context}</p>
      <textarea
        ref={area}
        value={comment}
        placeholder={labels.placeholder}
        aria-label={labels.placeholder}
        rows={roomy ? 3 : 2}
        maxLength={maxLength}
        onChange={(e) => setComment(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            onSubmit(comment, true);
          }
        }}
        className="min-h-16 w-full resize-none rounded-xl border border-line-input bg-input px-3 py-2 text-base leading-[22px] text-ink outline-none placeholder:text-ink-muted focus-visible:border-ink-muted"
      />
      {maxLength !== undefined && comment.length >= maxLength && (
        <p role="status" className="text-xs text-ink-muted">
          {labels.tooLong ?? `Comments can be up to ${maxLength} characters.`}
        </p>
      )}
      <div className={cn("flex items-center gap-1.5", roomy && "gap-2")}>
        {editing && onRemove && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRemove}
            className="pdf-press mr-auto text-danger-ink"
          >
            {labels.remove}
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          size={roomy ? "lg" : "sm"}
          onClick={() => onCancel(false)}
          className={cn(
            "pdf-press",
            !editing && "ml-auto",
            roomy && "h-11 flex-1",
          )}
        >
          {labels.cancel}
        </Button>
        <Button
          type="submit"
          size={roomy ? "lg" : "sm"}
          className={cn("pdf-press", roomy && "h-11 flex-1")}
        >
          {editing ? labels.save : labels.add}
          {!roomy && (
            <span aria-hidden className="text-xs opacity-60">
              {labels.shortcut}
            </span>
          )}
        </Button>
      </div>
    </form>
  );
}
