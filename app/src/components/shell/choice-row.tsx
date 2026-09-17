import { Button, cn, Input } from "@houston-ai/core";
import { PenLine } from "lucide-react";
import type { FormEvent, KeyboardEvent, RefObject } from "react";
import { AGENT_ROLE_PART_MAX_LENGTH } from "../../lib/agent-role-context";
import { CHIP_BASE } from "./choice-chips";
import type { ChoiceStepSearch } from "./choice-step-model";

/**
 * ONE row, two states, one slot: the way INTO a long catalog, and the way out
 * of it. Browsing, it is the filter field with "Something else" beside it;
 * answering, the same field becomes the answer and the same pill becomes
 * Continue. The states are written side by side because they share a geometry
 * (`ROW`, `ROW_FIELD`) that must never drift: a typed answer that appeared
 * somewhere else on the screen made the user hunt for the field they had just
 * asked for, and moved the suggestions under their thumb.
 *
 * Desktop gives the field the width (a query is read while it is typed) and
 * the control beside it only what its words need; the phone stacks them, the
 * control underneath, full width where a thumb lands.
 */
const ROW = "flex flex-col gap-2 md:flex-row md:items-center md:gap-3";
const ROW_FIELD = "h-11 w-full rounded-full px-4 md:h-9 md:min-w-0 md:flex-1";

/**
 * The browsing state. The door sits here rather than at the head of the
 * suggestions because it is not one of them. Pairing it with the filter says
 * the true thing — "narrow this list, or leave it" — and it stays in one fixed
 * place instead of moving with every query. It is an ordinary tab stop right
 * after the field, so a keyboard reaches it before entering the chips' grid.
 */
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
  /** Absent when the question is short enough to read without filtering. */
  search?: ChoiceStepSearch;
  query: string;
  searchRef: RefObject<HTMLInputElement | null>;
  customLabel: string;
  /** Leaving the typed answer hands focus back here. */
  customRef: RefObject<HTMLButtonElement | null>;
  onQueryChange: (query: string) => void;
  /** Enter answers the question, Escape clears the query (`ChoiceStep`). */
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
          // A query longer than an answer matches nothing, and this field
          // seeds the typed answer ("use what you typed"), so it carries the
          // answer's own cap rather than letting a paste through a side door.
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

/**
 * The answering state. Picking a chip answers its question outright, but
 * nothing can know a typed answer is finished, so this one is submitted:
 * Enter, or the Continue that took the door's place.
 *
 * Escape leaves the answer for the suggestions behind it, which the step owns
 * (`useEscapeWithin`) because the same key also clears a query. A phone has no
 * Escape at all, so it gets the way back as a control.
 */
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
        // The answer is a label, and it is seeded verbatim into the agent's
        // instructions: a pasted page must stop at the field, not arrive as a
        // hundred-thousand-character job description.
        maxLength={AGENT_ROLE_PART_MAX_LENGTH}
        placeholder={placeholder}
        aria-label={placeholder}
        className={ROW_FIELD}
      />
      {/* `md:contents` dissolves this wrapper on a desktop, so Continue sits
          in the row itself exactly where the door stood. */}
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
