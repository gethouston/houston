import { durationMs, easing } from "@houston/design-tokens";
import { cn, Input } from "@houston-ai/core";
import { motion, useAnimate, useReducedMotion } from "framer-motion";
import { Dices } from "lucide-react";
import { type KeyboardEvent, type Ref, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  employeeNamePlaceholder,
  fittingNamePlaceholder,
} from "./employee-name-placeholder";
import { useFittingPlaceholder } from "./use-fitting-placeholder";

const FAST_S = durationMs.fast / 1000;

export function EmployeeNameField({
  value,
  label,
  role,
  invalid,
  describedBy,
  inputRef,
  autoFocus,
  onChange,
  onSuggest,
  onKeyDown,
  onBlur,
}: {
  value: string;
  /** Includes the role to distinguish name fields in the team. */
  label: string;
  /** The job the placeholder's examples lead with, when the card knows it
   *  and the field has room for it whole. */
  role?: string;
  invalid: boolean;
  describedBy: string;
  inputRef?: Ref<HTMLInputElement>;
  autoFocus?: boolean;
  onChange: (value: string) => void;
  onSuggest: () => void;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  onBlur?: () => void;
}) {
  const { t } = useTranslation("shell");
  const id = useId();
  const preferred = employeeNamePlaceholder(role);
  const measured = useFittingPlaceholder(
    t(preferred.key, preferred.values),
    inputRef,
  );
  const placeholder = fittingNamePlaceholder(
    preferred,
    measured.fit.textWidth,
    measured.fit.availableWidth,
  );
  const reduce = useReducedMotion() ?? false;
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const [turns, setTurns] = useState(0);

  const suggest = () => {
    onSuggest();
    setTurns((count) => count + 1);
    animate(
      "input",
      reduce ? { opacity: [0, 1] } : { opacity: [0, 1], y: [4, 0] },
      { duration: FAST_S, ease: easing.entrance },
    );
  };

  return (
    <div ref={scope} className="flex min-w-0 flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {t("employeeCard.nameHeading")}
      </label>
      <div
        className={cn(
          "flex min-w-0 items-center rounded-lg border bg-input has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-focus",
          invalid ? "border-danger" : "border-line-input",
        )}
      >
        <Input
          id={id}
          ref={measured.ref}
          type="text"
          data-employee-name=""
          value={value}
          placeholder={t(placeholder.key, placeholder.values)}
          autoFocus={autoFocus}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={onBlur}
          aria-label={label}
          aria-required="true"
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          autoComplete="off"
          className="h-11 flex-1 rounded-none border-0 bg-transparent px-3 text-base font-normal placeholder:text-ink/70 transition-none dark:bg-transparent"
        />
        <button
          type="button"
          onClick={suggest}
          aria-label={t("employeeCard.suggestName")}
          title={t("employeeCard.suggestName")}
          className="flex size-11 shrink-0 items-center justify-center rounded-full text-ink-muted outline-none hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-focus active:scale-[0.96] motion-reduce:transform-none"
        >
          <motion.span
            aria-hidden="true"
            className="flex"
            animate={{ rotate: reduce ? 0 : turns * 180 }}
            transition={{ duration: FAST_S, ease: easing.entrance }}
          >
            <Dices className="size-4" />
          </motion.span>
        </button>
      </div>
    </div>
  );
}
