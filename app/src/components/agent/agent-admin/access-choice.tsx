import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { type KeyboardEvent, useId, useRef } from "react";
import type { AccessMode } from "./agent-admin-row-values.ts";

export interface AccessChoiceOption {
  value: AccessMode;
  label: string;
  description: string;
}

interface AccessChoiceProps {
  labelledBy: string;
  options: readonly [AccessChoiceOption, AccessChoiceOption];
  value: AccessMode;
  disabled?: boolean;
  onChange: (value: AccessMode) => void;
}

export function AccessChoice({
  labelledBy,
  options,
  value,
  disabled,
  onChange,
}: AccessChoiceProps) {
  const thumbId = useId();
  const reduce = useReducedMotion();
  const radioRefs = useRef<Partial<Record<AccessMode, HTMLButtonElement>>>({});

  const select = (next: AccessMode) => {
    if (!disabled && next !== value) onChange(next);
  };

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
        aria-labelledby={labelledBy}
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
                  className="absolute inset-0 rounded-full bg-action"
                  transition={
                    reduce
                      ? { duration: 0 }
                      : { type: "spring", stiffness: 380, damping: 32 }
                  }
                />
              )}
              <span
                className={`relative z-10 block truncate ${
                  checked ? "text-action-text" : "text-ink-muted"
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
