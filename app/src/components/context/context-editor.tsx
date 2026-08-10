import { cn, Spinner } from "@houston-ai/core";
import { Check } from "lucide-react";
import {
  type ComponentProps,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { PageHero } from "../shell/page-shell";
import { isDirty, shouldReseed } from "./context-editor-model";
import { MarkdownEditor } from "./markdown-editor";

type SaveState = "idle" | "saving" | "saved";

/**
 * THE standing-prose editor, everywhere the product asks for one: About me,
 * Admin > Company context, an agent's Job description, a team's shared
 * context — and whatever context surface appears next. One grammar, held by
 * this file so no surface can drift:
 *
 * - **Always open.** No invite empty state: the greyed suggestion inside the
 *   box is the invitation, and it disappears the moment the user types.
 * - **Saves on blur, says so quietly.** The "Saving…/Saved" status sits in
 *   the toolbar's right seat; a save fires only when the text actually
 *   changed, so tabbing through a page writes nothing.
 * - **Explains itself ONCE.** The title + explanation live in the heading
 *   ({@link ContextEditorPage}'s hero, or a card's own header); the
 *   box never carries a second description.
 * - **Read-only is the same face, locked.** Someone who may not edit still
 *   reads what the agents are told; the text stays legible, never hidden.
 */
export function ContextEditorBox({
  content,
  onSave,
  placeholder,
  readOnly = false,
  minRows,
  ariaLabel,
  dataTestId,
}: {
  content: string;
  onSave: (content: string) => Promise<unknown>;
  /** The greyed suggestion text — a short example of what belongs here. */
  placeholder: string;
  readOnly?: boolean;
  /** Rows floor for a compact card; omitted, the document fills the screen. */
  minRows?: number;
  /** Accessible name when no visible heading labels the box directly. */
  ariaLabel?: string;
  dataTestId?: string;
}) {
  const { t } = useTranslation("context");
  const [value, setValue] = useState(content);
  const [state, setState] = useState<SaveState>("idle");
  const valueRef = useRef(content);
  const baselineRef = useRef(content);
  const focusedRef = useRef(false);
  const awaitingSeedRef = useRef(true);
  const contentPropRef = useRef(content);
  const onSaveRef = useRef(onSave);
  const readOnlyRef = useRef(readOnly);

  onSaveRef.current = onSave;
  readOnlyRef.current = readOnly;
  useEffect(() => {
    if (contentPropRef.current === content) return;
    contentPropRef.current = content;
    if (
      !shouldReseed({
        focused: focusedRef.current,
        dirty: isDirty(valueRef.current, baselineRef.current),
      })
    ) {
      return;
    }
    awaitingSeedRef.current = true;
    valueRef.current = content;
    setValue(content);
  }, [content]);

  useEffect(
    () => () => {
      if (
        readOnlyRef.current ||
        !isDirty(valueRef.current, baselineRef.current)
      ) {
        return;
      }
      // The data layer surfaces failures; cleanup has no mounted UI to update.
      onSaveRef.current(valueRef.current).catch(() => {});
    },
    [],
  );

  const handleChange = useCallback((markdown: string) => {
    valueRef.current = markdown;
    setValue(markdown);
    if (awaitingSeedRef.current) {
      baselineRef.current = markdown;
      awaitingSeedRef.current = false;
    }
  }, []);

  const handleBlur = async () => {
    const current = valueRef.current;
    if (readOnly || !isDirty(current, baselineRef.current)) return;
    setState("saving");
    try {
      await onSave(current);
      baselineRef.current = current;
      setState("saved");
      window.setTimeout(() => setState("idle"), 2000);
    } catch {
      // The data layer owns the toast (`lib/tauri.ts` `call()` /
      // `surfaceEngineError` on every save path) — the box only recovers so
      // "Saving…" never sticks, and the unsaved text stays in the field for
      // the user to retry.
      setState("idle");
    }
  };

  // Seated on the toolbar's right edge, clear of the text — a fixed seat, so
  // its appearing and fading never moves the document by a pixel.
  const status = (
    <span
      className={cn(
        "flex items-center gap-1 text-xs tabular-nums transition-opacity duration-200",
        state === "idle" ? "opacity-0" : "opacity-100 text-ink-muted",
      )}
      aria-live="polite"
    >
      {state === "saved" && <Check aria-hidden className="size-3.5" />}
      {state === "saving"
        ? t("editor.saving")
        : state === "saved"
          ? t("editor.saved")
          : ""}
    </span>
  );

  return (
    // The editor is its own document card — no second frame around it. In
    // full-page mode this box just hands its granted height down.
    <div className={cn("w-full", minRows === undefined && "h-full min-h-0")}>
      <MarkdownEditor
        ariaLabel={ariaLabel}
        dataTestId={dataTestId}
        content={value}
        onChange={handleChange}
        onBlur={handleBlur}
        readOnly={readOnly}
        placeholder={placeholder}
        minRows={minRows}
        statusSlot={status}
        onFocusChange={(focused) => {
          focusedRef.current = focused;
        }}
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
} & ComponentProps<typeof ContextEditorBox>) {
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
          <ContextEditorBox ariaLabel={title} {...box} />
        </div>
      ) : (
        <div className="flex items-center justify-center py-16">
          <Spinner className="h-5 w-5" />
        </div>
      )}
    </div>
  );
}
