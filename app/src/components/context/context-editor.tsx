import { cn, Spinner } from "@houston-ai/core";
import { Check } from "lucide-react";
import type { ComponentProps } from "react";
import { useTranslation } from "react-i18next";
import { PageHero } from "../shell/page-shell";
import type { ContextEditorLayout } from "./context-editor-model";
import { MarkdownEditor } from "./markdown-editor";
import { useContextEditorSave } from "./use-context-editor-save";

export type { ContextEditorLayout } from "./context-editor-model";

/**
 * THE standing-prose editor, everywhere the product asks for one: About me,
 * Admin > Company context, an agent's Job description, a team's shared
 * context — and whatever context surface appears next. One grammar, held by
 * this file so no surface can drift:
 *
 * - **Always open.** No invite empty state: the greyed rendered example in
 *   the box is the invitation, gone the moment the user types.
 * - **Saves on blur, says so quietly.** The "Saving…/Saved" status sits in
 *   the toolbar's right seat; a save fires only when the text actually
 *   changed (`use-context-editor-save` owns the machine and its queue).
 * - **Explains itself ONCE.** The title + explanation live in the heading
 *   ({@link ContextEditorPage}'s hero, or a card's own header); the box
 *   never carries a second description.
 * - **Read-only is the same face, locked.** Someone who may not edit still
 *   reads what the agents are told; the text stays legible, never hidden.
 * - **Never corrupts.** A document the rich schema can't represent (tables,
 *   raw HTML — agents write these files too) opens in the plain-text
 *   fallback instead of round-tripping lossily.
 */
export function ContextEditorBox({
  content,
  onSave,
  placeholder,
  layout,
  readOnly = false,
  ariaLabel,
  dataTestId,
}: {
  content: string;
  onSave: (content: string) => Promise<unknown>;
  /** The greyed suggestion text — a short example of what belongs here. */
  placeholder: string;
  layout: ContextEditorLayout;
  readOnly?: boolean;
  /** Accessible name when no visible heading labels the box directly. */
  ariaLabel?: string;
  dataTestId?: string;
}) {
  const { t } = useTranslation("context");
  const save = useContextEditorSave({ content, onSave, readOnly });

  // Seated on the toolbar's right edge, clear of the text — a fixed seat, so
  // its appearing and fading never moves the document by a pixel.
  const status = (
    <span
      className={cn(
        "flex items-center gap-1 text-xs tabular-nums transition-opacity duration-200",
        save.state === "idle" ? "opacity-0" : "opacity-100 text-ink-muted",
      )}
      aria-live="polite"
    >
      {save.state === "saved" && <Check aria-hidden className="size-4" />}
      {save.state === "saving"
        ? t("editor.saving")
        : save.state === "saved"
          ? t("editor.saved")
          : ""}
    </span>
  );

  return (
    // The editor is its own document card — no second frame around it. In
    // fill mode this box just hands its granted height down.
    <div className={cn("w-full", layout === "fill" && "h-full min-h-0")}>
      <MarkdownEditor
        ariaLabel={ariaLabel}
        dataTestId={dataTestId}
        content={save.value}
        plain={save.plainDoc}
        layout={layout}
        onChange={save.handleChange}
        onBlur={save.handleBlur}
        onFocusChange={save.handleFocusChange}
        readOnly={readOnly}
        placeholder={placeholder}
        statusSlot={status}
      />
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
} & Omit<ComponentProps<typeof ContextEditorBox>, "layout">) {
  return (
    // A pinned page: hero on top, the document card taking every remaining
    // pixel, and `pb-6` as THE fixed gap to the window's bottom edge — a
    // longer document scrolls inside the card instead of growing the page.
    <div className="flex h-full min-h-0 w-full flex-col pb-6">
      <PageHero
        level={level}
        title={title}
        subtitle={subtitle}
        className="mb-3 shrink-0"
      />
      {ready ? (
        // The hero visually titles the box but is not programmatically
        // associated with it, so the title doubles as the accessible name
        // unless the caller passes a more specific one.
        <div className="min-h-0 flex-1">
          <ContextEditorBox layout="fill" ariaLabel={title} {...box} />
        </div>
      ) : (
        <div className="flex items-center justify-center py-16">
          <Spinner className="h-5 w-5" />
        </div>
      )}
    </div>
  );
}
