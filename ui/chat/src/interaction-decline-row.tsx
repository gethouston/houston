"use client";

import { cn } from "@houston-ai/core";
import { ArrowUp } from "lucide-react";
import { useState } from "react";
import { normalizeAnswer } from "./interaction-card-model.ts";

/**
 * The always-visible single-line free-text row every non-question interaction
 * step carries: under an approval it's "type what to do differently", under a
 * connect / sign-in / credential step it's "or tell it what to do instead".
 * Either way it's the SAME widget — a MINIATURE of the real composer (rounded
 * pill, hairline border, a circular arrow-up send that turns on the moment there
 * is text), so nothing about it needs learning. Never hover-gated: present at
 * rest on every live step.
 *
 * Owns its own draft (a step with no question has no draft slot in the stepper).
 * `onSubmit` fires with the trimmed text (never empty) via {@link normalizeAnswer};
 * the consuming card turns that into its decline-with-instruction / redirection.
 * Enter or the arrow sends. Props-only, i18n-agnostic: the consumer passes the
 * placeholder + the send button's aria-label already translated.
 */
export function InlineTextRow({
  placeholder,
  sendLabel,
  disabled,
  onSubmit,
}: {
  placeholder: string;
  /** aria-label of the arrow-up send button ("Send"). */
  sendLabel: string;
  disabled: boolean;
  onSubmit: (text: string) => void;
}) {
  const [value, setValue] = useState("");
  const text = normalizeAnswer(value);
  const submit = () => {
    if (text !== null) onSubmit(text);
  };
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: focus-delegation surface — the real widget is the <input> inside; clicking the field's padding focuses it (mirrors the composer). role="presentation" is correct, no widget role applies.
    <div
      className={cn(
        "mt-3 flex cursor-text items-center gap-2 rounded-full border border-line-input bg-transparent py-1 pr-1 pl-3.5 transition-colors focus-within:border-focus dark:bg-line-input/30",
        disabled && "pointer-events-none opacity-50",
      )}
      onClick={(e) => e.currentTarget.querySelector("input")?.focus()}
      role="presentation"
    >
      <input
        className="min-w-0 flex-1 border-none bg-transparent py-1 text-ink text-sm leading-snug outline-none placeholder:text-ink-muted"
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={placeholder}
        value={value}
      />
      <button
        aria-label={sendLabel}
        className="flex size-7 shrink-0 items-center justify-center rounded-full bg-action text-action-text transition-colors hover:bg-action/90 disabled:opacity-30"
        disabled={disabled || text === null}
        onClick={(e) => {
          e.stopPropagation();
          submit();
        }}
        type="button"
      >
        <ArrowUp className="size-4" />
      </button>
    </div>
  );
}
