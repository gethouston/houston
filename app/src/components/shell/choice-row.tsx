import { Button, cn, Input } from "@houston-ai/core";
import { PenLine } from "lucide-react";
import type { FormEvent, KeyboardEvent, RefObject } from "react";
import { AGENT_ROLE_PART_MAX_LENGTH } from "../../lib/agent-role-context";
import { CHIP_BASE } from "./choice-chips";
import type { ChoiceStepSearch } from "./choice-step-model";

const ROW = "flex flex-col gap-2 md:flex-row md:items-center md:gap-3";
const ROW_FIELD = "h-11 w-full rounded-full px-4 md:h-9 md:min-w-0 md:flex-1";

export function ChoiceSearchRow({
  search,
  query,
  searchRef,
  customLabel,
  customRef,
  onQueryChange,
  onSearchKeyDown,
  onSelectCustom,
}: {
  search?: ChoiceStepSearch;
  query: string;
  searchRef: RefObject<HTMLInputElement | null>;
  customLabel: string;
  customRef: RefObject<HTMLButtonElement | null>;
  onQueryChange: (query: string) => void;
  onSearchKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onSelectCustom: () => void;
}) {
  return (
    <div className={cn(ROW, "create-swap-in")}>
      {search && (
        <Input
          ref={searchRef}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={onSearchKeyDown}
          maxLength={AGENT_ROLE_PART_MAX_LENGTH}
          placeholder={search.placeholder}
          aria-label={search.placeholder}
          className={ROW_FIELD}
        />
      )}
      <button
        ref={customRef}
        type="button"
        onClick={onSelectCustom}
        className={cn(
          CHIP_BASE,
          "w-full md:w-auto md:shrink-0",
          "ht-hairline text-ink hover:bg-hover hover:text-hover-text",
        )}
      >
        <PenLine className="size-4 shrink-0" aria-hidden />
        {customLabel}
      </button>
    </div>
  );
}

export function ChoiceAnswerRow({
  value,
  placeholder,
  continueLabel,
  cancelLabel,
  onChange,
  onCancel,
  onContinue,
}: {
  value: string;
  placeholder: string;
  continueLabel: string;
  cancelLabel: string;
  onChange: (value: string) => void;
  onCancel: () => void;
  onContinue: () => void;
}) {
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (value.trim()) onContinue();
  };

  return (
    <form onSubmit={submit} className={cn(ROW, "create-swap-in")}>
      <Input
        autoFocus
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={AGENT_ROLE_PART_MAX_LENGTH}
        placeholder={placeholder}
        aria-label={placeholder}
        className={ROW_FIELD}
      />
      <div className="flex gap-2 md:contents">
        <Button
          type="submit"
          disabled={!value.trim()}
          className="h-11 flex-1 md:h-9 md:flex-none"
        >
          {continueLabel}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          className="h-11 md:hidden"
        >
          {cancelLabel}
        </Button>
      </div>
    </form>
  );
}
