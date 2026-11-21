"use client";

import { cn } from "@houston-ai/core";
import { ArrowRight } from "lucide-react";
import { useState } from "react";
import type { ChatInteractionOption } from "./interaction-card-logic";

export function BrandLogo({ url, name }: { url: string; name: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <img
      alt={name}
      className="size-6 shrink-0 rounded-lg object-contain"
      decoding="async"
      loading="lazy"
      onError={() => setFailed(true)}
      src={url}
    />
  );
}

export function QuestionStepBody({
  options,
  selectedId,
  disabled,
  recommendedLabel,
  onOption,
}: {
  options?: ChatInteractionOption[];
  selectedId: string | null;
  disabled: boolean;
  recommendedLabel: string;
  onOption: (optionId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      {options && options.length > 0 && (
        <div className="flex flex-col gap-0.5" role="radiogroup">
          {options.map((option, index) => (
            <OptionRow
              disabled={disabled}
              key={option.id}
              onSelect={() => onOption(option.id)}
              option={option}
              position={index + 1}
              recommendedLabel={recommendedLabel}
              selected={selectedId === option.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function OptionRow({
  option,
  selected,
  disabled,
  position,
  recommendedLabel,
  onSelect,
}: {
  option: ChatInteractionOption;
  selected: boolean;
  disabled: boolean;
  position: number;
  recommendedLabel: string;
  onSelect: () => void;
}) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: a full-width single-select row needs a native <button> (focus + Enter/Space activation) with role="radio" for the radiogroup semantics; <input type="radio"> can't carry this layout/content.
    <button
      aria-checked={selected}
      className={cn(
        "group flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left outline-none transition-colors",
        "hover:bg-hover focus-visible:bg-hover",
        "focus-visible:ring-[2px] focus-visible:ring-focus/50",
        "disabled:pointer-events-none disabled:opacity-50",
        selected && "bg-hover",
      )}
      disabled={disabled}
      onClick={onSelect}
      role="radio"
      type="button"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="min-w-0 break-words text-ink text-sm leading-snug">
            {option.label}
          </span>
          {option.recommended && (
            <span className="shrink-0 rounded-full bg-chip px-2 py-0.5 font-medium text-[11px] text-ink-muted">
              {recommendedLabel}
            </span>
          )}
        </span>
        {option.description ? (
          <span className="min-w-0 break-words text-ink-muted text-xs leading-snug">
            {option.description}
          </span>
        ) : null}
      </span>
      <span className="relative flex size-7 shrink-0 items-center justify-center">
        <span
          className={cn(
            "absolute inset-0 flex items-center justify-center rounded-full bg-chip-subtle font-medium text-[13px] text-ink-muted tabular-nums transition-opacity",
            "group-hover:opacity-0",
            selected && "opacity-0",
          )}
        >
          {position}
        </span>
        <ArrowRight
          className={cn(
            "size-4 text-ink-muted opacity-0 transition-opacity",
            "group-hover:opacity-100",
            selected && "opacity-100",
          )}
        />
      </span>
    </button>
  );
}
