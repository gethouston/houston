import { cn, Input } from "@houston-ai/core";
import { Pencil } from "lucide-react";
import { type KeyboardEvent, type Ref, useId, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  employeeNamePlaceholder,
  fittingNamePlaceholder,
} from "./employee-name-placeholder";
import { useFittingPlaceholder } from "./use-fitting-placeholder";

export function EmployeeNameField({
  value,
  label,
  role,
  invalid,
  describedBy,
  inputRef,
  onChange,
  onKeyDown,
  onBlur,
}: {
  value: string;
  label: string;
  role?: string;
  invalid: boolean;
  describedBy: string;
  inputRef?: Ref<HTMLInputElement>;
  onChange: (value: string) => void;
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
  const keepSelection = useRef(false);

  return (
    <div
      className={cn(
        "flex min-h-12 min-w-0 rounded-lg border bg-input has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-focus",
        invalid ? "border-danger" : "border-line-input",
      )}
    >
      <label
        htmlFor={id}
        className="flex min-w-0 flex-1 cursor-text flex-col justify-center py-0.5 pl-3"
      >
        <span className="text-xs text-ink/70">
          {t("employeeCard.nameHeading")}
        </span>
        <Input
          id={id}
          ref={measured.ref}
          type="text"
          data-employee-name=""
          value={value}
          placeholder={t(placeholder.key, placeholder.values)}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          onMouseDown={(event) => {
            keepSelection.current = document.activeElement !== event.target;
          }}
          onFocus={(event) => event.currentTarget.select()}
          onMouseUp={(event) => {
            if (!keepSelection.current) return;
            keepSelection.current = false;
            event.preventDefault();
          }}
          onBlur={onBlur}
          aria-label={label}
          aria-required="true"
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          autoComplete="off"
          className="h-6 rounded-none border-0 bg-transparent p-0 text-base font-medium placeholder:font-normal placeholder:text-ink/70 transition-none dark:bg-transparent"
        />
      </label>
      <label
        htmlFor={id}
        aria-hidden="true"
        className="flex w-9 shrink-0 cursor-text items-center justify-center text-ink-muted"
      >
        <Pencil className="size-4" />
      </label>
    </div>
  );
}
