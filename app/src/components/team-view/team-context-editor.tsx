import { CatalogSectionHeader, cn } from "@houston-ai/core";
import { useEffect, useState } from "react";

type SaveState = "idle" | "saving" | "saved";

export interface TeamContextEditorLabels {
  title: string;
  explainer: string;
  placeholder: string;
  saving: string;
  saved: string;
}

/**
 * The team's shared context, as the first card of its Manage agents page: what
 * every agent of this team is told before it starts a turn.
 *
 * It saves ON BLUR and says so quietly, the SAME idiom the agent's own
 * instructions editor uses (`InstructionsContent` in `job-description-parts`).
 * Two editors of standing prose that commit differently would be the surprise;
 * a Save button here and none there is a rule the user has to hold in their
 * head. A save fires only when the text actually changed, so tabbing through
 * the page writes nothing.
 *
 * Presentational and props-only: WHERE the content is stored (the sidebar
 * group, the layout's default-team field, the gateway) is
 * `team-context-model.ts`'s question
 * and the wired branches in `team-context-card.tsx` answer it. This file never
 * learns which backend it is drawing.
 *
 * The read-only face is the whole card, unlocked-looking but locked: someone who
 * may not edit the team still needs to know what its agents are being told, so
 * the text stays legible rather than being hidden or replaced by a notice.
 */
export function TeamContextEditor({
  content,
  onSave,
  labels,
  readOnly = false,
}: {
  content: string;
  onSave: (content: string) => Promise<unknown>;
  labels: TeamContextEditorLabels;
  readOnly?: boolean;
}) {
  const [value, setValue] = useState(content);
  const [state, setState] = useState<SaveState>("idle");

  // Re-seed from the store whenever it changes under us: another window's save,
  // or our own landing back through the query cache.
  useEffect(() => {
    setValue(content);
  }, [content]);

  const handleBlur = async () => {
    if (readOnly || value === content) return;
    setState("saving");
    await onSave(value);
    setState("saved");
    window.setTimeout(() => setState("idle"), 2000);
  };

  return (
    <section className="mb-10">
      <div className="mb-1 flex items-center justify-between gap-4">
        <CatalogSectionHeader title={labels.title} />
        <span
          className={cn(
            "text-[11px] tabular-nums transition-opacity duration-200",
            state === "idle" ? "opacity-0" : "opacity-100 text-ink-muted",
          )}
          aria-live="polite"
        >
          {state === "saving"
            ? labels.saving
            : state === "saved"
              ? labels.saved
              : ""}
        </span>
      </div>
      <p className="mb-4 text-sm text-ink-muted">{labels.explainer}</p>
      <textarea
        aria-label={labels.title}
        data-testid="team-context-input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={handleBlur}
        readOnly={readOnly}
        placeholder={labels.placeholder}
        rows={Math.max(6, value.split("\n").length + 1)}
        className={cn(
          "w-full px-4 py-3 text-sm text-ink leading-relaxed",
          "placeholder:text-ink-muted/60",
          "bg-input border border-ink/[0.04] rounded-lg",
          "outline-none resize-none transition-shadow duration-200",
          "focus:shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
          readOnly && "cursor-default text-ink-muted",
        )}
      />
    </section>
  );
}
