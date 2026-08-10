import { cn, Spinner } from "@houston-ai/core";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { PageHero } from "../shell/page-shell";

type SaveState = "idle" | "saving" | "saved";

/**
 * THE standing-prose editor, everywhere the product asks for one: About me,
 * Admin > Company context, an agent's Job description, a team's shared
 * context — and whatever context surface appears next. One grammar, held by
 * this file so no surface can drift:
 *
 * - **Always open.** No invite empty state: the greyed suggestion inside the
 *   box is the invitation, and it disappears the moment the user types.
 * - **Saves on blur, says so quietly.** The slim right-aligned "Saving…/
 *   Saved" line above the box; a save fires only when the text actually
 *   changed, so tabbing through a page writes nothing.
 * - **Explains itself ONCE.** The title + one-line explanation live in the
 *   heading ({@link ContextEditorPage}'s hero, or a card's own header); the
 *   box never carries a second description.
 * - **Read-only is the same face, locked.** Someone who may not edit still
 *   reads what the agents are told; the text stays legible, never hidden.
 */
export function ContextEditorBox({
  content,
  onSave,
  placeholder,
  readOnly = false,
  minRows = 12,
  ariaLabel,
  dataTestId,
}: {
  content: string;
  onSave: (content: string) => Promise<unknown>;
  /** The greyed suggestion text — a short example of what belongs here. */
  placeholder: string;
  readOnly?: boolean;
  /** Empty-box height; a card in a longer page wants fewer rows than a page. */
  minRows?: number;
  /** Accessible name when no visible heading labels the box directly. */
  ariaLabel?: string;
  dataTestId?: string;
}) {
  const { t } = useTranslation("context");
  const [value, setValue] = useState(content);
  const [state, setState] = useState<SaveState>("idle");

  // Re-seed from the store whenever it changes under us: another window's
  // save, or our own landing back through the query cache.
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
    <div className="w-full">
      {/* The save state keeps a reserved right-edge seat, so the box never
          shifts when it appears. */}
      <div className="mb-1 flex items-baseline justify-end">
        <span
          className={cn(
            "text-[11px] tabular-nums transition-opacity duration-200",
            state === "idle" ? "opacity-0" : "opacity-100 text-ink-muted",
          )}
          aria-live="polite"
        >
          {state === "saving"
            ? t("editor.saving")
            : state === "saved"
              ? t("editor.saved")
              : ""}
        </span>
      </div>
      <section className="rounded-xl bg-chip p-3">
        <textarea
          aria-label={ariaLabel}
          data-testid={dataTestId}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={handleBlur}
          readOnly={readOnly}
          placeholder={placeholder}
          rows={Math.max(minRows, value.split("\n").length + 2)}
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
    </div>
  );
}

/**
 * A standing-context PAGE: the hero (a clear title + one short line saying
 * what belongs here) sitting tight over the {@link ContextEditorBox}. Pass
 * `level={2}` when the screen's `<h1>` already lives in its header strip.
 * `ready` gates the box behind a spinner while the backing read lands — a
 * loading frame, which is not an empty state.
 */
export function ContextEditorPage({
  title,
  subtitle,
  level = 1,
  ready = true,
  ...box
}: {
  title: string;
  subtitle: string;
  level?: 1 | 2;
  ready?: boolean;
} & Parameters<typeof ContextEditorBox>[0]) {
  return (
    <div className="w-full pb-12">
      <PageHero
        level={level}
        title={title}
        subtitle={subtitle}
        className="mb-3"
      />
      {ready ? (
        <ContextEditorBox {...box} />
      ) : (
        <div className="flex items-center justify-center py-16">
          <Spinner className="h-5 w-5" />
        </div>
      )}
    </div>
  );
}
