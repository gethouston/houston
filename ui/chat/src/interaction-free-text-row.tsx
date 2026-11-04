"use client";

import { cn } from "@houston-ai/core";
import { ArrowUp } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { ChatInputAttachButton } from "./chat-input-attach-button";
import { applyTextareaFit } from "./textarea-fit";
import type { CardAttach } from "./use-card-attachments";

/** The field's growth cap, the textarea's `max-h-40`. */
const FREE_TEXT_MAX_PX = 160;
/** Taller content than this has wrapped: one line is ~27px. */
const ONE_LINE_PX = 32;

/** The free-text escape row: the answer field the user types their OWN answer
 *  into. It is a MINIATURE of the real composer so nothing about it needs
 *  learning: the same 28px pill roundness, the same `border-line-input` hairline,
 *  the composer's leading "+" when the card carries the panel's attachments,
 *  and the same circular arrow-up send button that turns on (bg-action at
 *  full strength) the moment there is text or a file — dimmed while empty,
 *  exactly like the chat input's send. Clicking anywhere in the field focuses
 *  the textarea; it grows with the text up to `FREE_TEXT_MAX_PX` and then
 *  scrolls. Once the text wraps it EXPANDS like the composer: the text takes
 *  the pill's full width and the "+" and send drop to a row beneath, so a
 *  phone-width card does not squeeze the answer into a narrow column. It
 *  stays expanded until the field is emptied (collapsing as soon as the text
 *  fits one wide line would rewrap it and flip back). Enter or the arrow
 *  submits; pasting a file
 *  attaches it. The card-wide decline is NOT here — it lives in the modal
 *  footer, so this row is purely the input it looks like. On a free-text-only
 *  question (no options) it is the primary answer field, so it takes a neutral
 *  placeholder. */
export function FreeTextRow({
  value,
  placeholder,
  sendLabel,
  disabled,
  attach,
  attachButton = true,
  fileAnswer = false,
  onChange,
  onSubmit,
}: {
  value: string;
  placeholder: string;
  sendLabel: string;
  disabled: boolean;
  attach?: CardAttach | null;
  /** Show the leading "+" (off when the step's upload area opens the picker;
   *  the field still takes a pasted file). */
  attachButton?: boolean;
  /** The attached files alone can answer, so the send lights up empty. */
  fileAnswer?: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [expanded, setExpanded] = useState(false);
  // Layout effect: the height lands before paint, so a new line never shows
  // a frame of the old box with a scrollbar in it. `expanded` is a dep so the
  // field re-measures at its new, full width.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    if (value) {
      const wrapped = applyTextareaFit(el, FREE_TEXT_MAX_PX) > ONE_LINE_PX;
      if (wrapped && !expanded) setExpanded(true);
    } else {
      el.style.height = "";
      el.style.overflow = "";
      setExpanded(false);
    }
  }, [value, expanded]);
  const canSend = value.trim().length > 0 || fileAnswer;
  const plus = attachButton ? attach : null;
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: focus-delegation surface — the real widget is the <textarea> inside; clicking the field's padding focuses it (mirrors the composer). role="presentation" is correct, no widget role applies.
    <div
      className={cn(
        "mt-1.5 flex cursor-text items-end gap-2 rounded-[28px] border border-line-input bg-transparent pr-1.5 transition-colors dark:bg-line-input/30",
        // The "+" is 4px taller than the send button, so the row trims its
        // vertical padding to keep the pill at the same height.
        plus ? "gap-1 py-1 pl-1" : "py-1.5 pl-4",
        expanded && "flex-wrap",
        "focus-within:border-focus",
        disabled && "pointer-events-none opacity-50",
      )}
      onClick={() => textareaRef.current?.focus()}
      role="presentation"
    >
      {plus && (
        <ChatInputAttachButton
          ariaLabel={plus.labels?.attachFiles}
          disabled={disabled}
          onOpenFilePicker={plus.openFilePicker}
          onOpenFolderPicker={plus.openFolderPicker}
        />
      )}
      <textarea
        className={cn(
          "max-h-40 min-w-0 flex-1 resize-none border-none bg-transparent py-1 text-ink text-sm leading-snug outline-none placeholder:text-ink-muted",
          // Collapsed, self-center keeps the one line where items-center put
          // it; expanded, it is the whole first row (indented past the
          // trimmed padding when the "+" is there).
          expanded
            ? cn("order-first basis-full", plus && "px-3")
            : "self-center",
        )}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSubmit();
          }
        }}
        onPaste={attach?.handlePaste}
        placeholder={placeholder}
        ref={textareaRef}
        rows={1}
        value={value}
      />
      {/* The composer's send button, verbatim: circular arrow-up that turns on
          with text (disabled:opacity-30 while empty, like the chat input). */}
      <button
        aria-label={sendLabel}
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full bg-action text-action-text transition-colors hover:bg-action/90 disabled:opacity-30",
          // Bottom-aligned beside the 4px-taller "+", 2px up keeps it centred
          // on a single line.
          plus && "mb-0.5",
          expanded && "ml-auto",
        )}
        disabled={disabled || !canSend}
        onClick={(e) => {
          e.stopPropagation();
          onSubmit();
        }}
        type="button"
      >
        <ArrowUp className="size-4" />
      </button>
    </div>
  );
}
