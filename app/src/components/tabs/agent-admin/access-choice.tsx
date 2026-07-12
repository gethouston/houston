import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { type KeyboardEvent, useId, useRef } from "react";
import type { AccessMode } from "./agent-admin-row-values.ts";

export interface AccessChoiceOption {
  value: AccessMode;
  label: string;
  description: string;
}

interface AccessChoiceProps {
  /** The accessible name for the radio group (applied as its `aria-label`). */
  question: string;
  /** Exactly two options: the "any" (allow-all) and "picked" (restricted) modes. */
  options: readonly [AccessChoiceOption, AccessChoiceOption];
  /** The currently selected mode. */
  value: AccessMode;
  /** A write is in flight (disables the control). */
  disabled?: boolean;
  /** Fired only when the selection actually changes. */
  onChange: (value: AccessMode) => void;
}

/**
 * Accessible two-option choice (radio semantics) for "Any X" vs "Only X you
 * pick", rendered as a segmented control: a pill track with a single elevated
 * thumb that slides (framer-motion shared layout) to the selected segment, and
 * the selected option's description cross-fading below. Keeps full radio
 * semantics: a labelled `role="radiogroup"` of `role="radio"` segments with
 * `aria-checked`, a roving tabindex + arrow-key navigation, and a focus-visible
 * ring. The question is not rendered as visible text (the section title already
 * shows it); it names the radio group via `aria-label`. i18n-agnostic: the
 * caller passes the question, labels, and descriptions in. Selecting the
 * already-selected option is a no-op, so re-picking "Only ... you pick" never
 * re-seeds the allowed set.
 */
export function AccessChoice({
  question,
  options,
  value,
  disabled,
  onChange,
}: AccessChoiceProps) {
  const thumbId = useId();
  const reduce = useReducedMotion();
  // One button element per option value, so arrow-key navigation can move DOM
  // focus onto the newly-checked radio (the roving-tabindex contract: focus
  // must follow selection, else a screen reader never announces the new option).
  const radioRefs = useRef<Partial<Record<AccessMode, HTMLButtonElement>>>({});

  const select = (next: AccessMode) => {
    if (!disabled && next !== value) onChange(next);
  };

  // Two options only, so any arrow key just moves to the other one (a radio
  // group must be arrow-navigable, not only clickable). Selection changes the
  // value AND moves focus to the newly-checked radio.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (
      e.key === "ArrowDown" ||
      e.key === "ArrowRight" ||
      e.key === "ArrowUp" ||
      e.key === "ArrowLeft"
    ) {
      e.preventDefault();
      if (disabled) return;
      const other = options.find((o) => o.value !== value);
      if (other) {
        select(other.value);
        radioRefs.current[other.value]?.focus();
      }
    }
  };

  const selected = options.find((o) => o.value === value) ?? options[0];

  return (
    <div className={disabled ? "opacity-50" : undefined}>
      <div
        role="radiogroup"
        aria-label={question}
        className="flex w-full max-w-md rounded-full bg-chip p-1"
        onKeyDown={onKeyDown}
      >
        {options.map((opt) => {
          const checked = opt.value === value;
          return (
            // biome-ignore lint/a11y/useSemanticElements: segments hold a sliding thumb a native radio input cannot; radio semantics come from role + aria-checked + roving tabindex.
            <button
              key={opt.value}
              ref={(el) => {
                if (el) radioRefs.current[opt.value] = el;
                else delete radioRefs.current[opt.value];
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              disabled={disabled}
              onClick={() => select(opt.value)}
              className="relative flex-1 rounded-full px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed"
            >
              {checked && (
                <motion.span
                  layoutId={thumbId}
                  aria-hidden
                  className="absolute inset-0 rounded-full bg-input shadow-sm"
                  transition={
                    reduce
                      ? { duration: 0 }
                      : { type: "spring", stiffness: 380, damping: 32 }
                  }
                />
              )}
              <span
                className={`relative z-10 block truncate ${
                  checked ? "text-ink" : "text-ink-muted"
                }`}
              >
                {opt.label}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-2 min-h-4">
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={selected.value}
            className="text-xs text-ink-muted"
            initial={reduce ? false : { opacity: 0, y: -3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 3 }}
            transition={{ duration: reduce ? 0 : 0.15 }}
          >
            {selected.description}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}
