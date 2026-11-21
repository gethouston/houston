"use client";

import { cn } from "@houston-ai/core";
import { ArrowUp } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { ChatInputAttachButton } from "./chat-input-attach-button";
import { applyTextareaFit } from "./textarea-fit";
import type { CardAttach } from "./use-card-attachments";

const FREE_TEXT_MAX_PX = 160;
const ONE_LINE_PX = 32;

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
  attachButton?: boolean;
  fileAnswer?: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [expanded, setExpanded] = useState(false);
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
      <button
        aria-label={sendLabel}
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full bg-action text-action-text transition-colors hover:bg-action/90 disabled:opacity-30",
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
