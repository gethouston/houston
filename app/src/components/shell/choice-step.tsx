import { Button, cn } from "@houston-ai/core";
import { type KeyboardEvent, useRef, useState } from "react";
import { ChoiceAnswerRow, ChoiceSearchRow } from "./choice-row";
import { ChoiceRuns } from "./choice-runs";
import {
  type ChoiceStepProps,
  choiceSearchEmptyState,
  enterAction,
  isChoiceSearchable,
  rovingChipId,
} from "./choice-step-model";
import {
  useChipGrid,
  useEscapeWithin,
  useLeaveWithFocus,
  useTypeToSearch,
} from "./use-choice-keyboard";

/**
 * One question of the guided create-agent setup: a headline, a filter paired
 * with the door out ("Something else"), and a wrapping run of suggestions.
 * Picking a suggestion answers the question outright (the caller advances); a
 * typed answer is confirmed with Continue, because there is no way to know the
 * user has finished typing.
 *
 * Taking the door swaps the row in place (`choice-row.tsx`): the field the
 * user was already looking at becomes the one they answer in, and the
 * suggestions stay behind it, dimmed, as the context the question was asked
 * in. An answer that opened somewhere else sent the eye hunting for it.
 *
 * Everything hangs off ONE left edge — headline, filter, chips, typed answer.
 * A hundred and eighty roles are read by scanning, and scanning needs an edge
 * to come back to; centred runs give a ragged one on every line.
 */
export function ChoiceStep({
  headline,
  hint,
  keyboardHint,
  sections,
  selectedId,
  custom,
  customLabel,
  customPlaceholder,
  continueLabel,
  cancelLabel,
  search,
  anchorAttrs,
  onSelect,
  onSelectCustom,
  onCancelCustom,
  onCustomChange,
  onContinue,
}: ChoiceStepProps & {
  /** Translated arrow-key hint for the chip runs; this step stays i18n-free. */
  keyboardHint?: string;
}) {
  const [query, setQuery] = useState("");
  // The chip the keyboard is on, which owns the question's only tab stop.
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const stepRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const customRef = useRef<HTMLButtonElement>(null);
  const grid = useChipGrid();
  const searchable = search !== undefined && isChoiceSearchable(search.reach);

  useTypeToSearch(stepRef, searchable && !custom.active, (character) => {
    setQuery((current) => current + character);
    searchRef.current?.focus();
  });

  const runs = searchable && search ? search.runsFor(query) : sections;
  const emptyState = choiceSearchEmptyState(runs, searchable ? query : "");

  const rovingId = rovingChipId(runs, selectedId, focusedId);

  // Opening the typed answer carries the words already in the filter: they ARE
  // the answer the user is giving, and asking for them twice is the kind of
  // small betrayal that makes a flow feel careless.
  const openCustom = () => {
    onSelectCustom();
    const seed = query.trim();
    if (seed) onCustomChange(seed);
  };

  // Enter clicks whatever the query already put on screen: the first match in
  // reading order, or the typed words themselves when nothing matched.
  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // An IME's Enter confirms the characters being composed; it answers nothing.
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    if (!search) return;
    const action = enterAction(runs, query);
    if (action.kind === "none") return;
    event.preventDefault();
    if (action.kind === "pick") onSelect(action.id);
    else search.onUseQuery(emptyState.query);
  };

  // Leaving the typed answer hands focus back to the door it came from, once
  // the row has swapped back and the door exists again.
  const leaveCustom = useLeaveWithFocus(
    custom.active,
    customRef,
    onCancelCustom,
  );

  // One key, one owner: the typed answer first, then the query it was opened
  // from. A step with neither left hands Escape back to the dialog.
  useEscapeWithin(stepRef, () => {
    if (custom.active) {
      leaveCustom();
      return true;
    }
    if (query === "") return false;
    setQuery("");
    return true;
  });

  return (
    <div ref={stepRef} className="flex min-h-0 flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <h2 className="text-balance text-2xl font-normal">{headline}</h2>
          {hint && <p className="text-sm text-ink-muted">{hint}</p>}
        </div>

        {custom.active ? (
          <ChoiceAnswerRow
            value={custom.value}
            placeholder={customPlaceholder}
            continueLabel={continueLabel}
            cancelLabel={cancelLabel}
            onChange={onCustomChange}
            onCancel={leaveCustom}
            onContinue={onContinue}
          />
        ) : (
          <ChoiceSearchRow
            search={searchable ? search : undefined}
            query={query}
            searchRef={searchRef}
            customLabel={customLabel}
            customRef={customRef}
            onQueryChange={setQuery}
            onSearchKeyDown={onSearchKeyDown}
            onSelectCustom={openCustom}
          />
        )}

        {/* The suggestions stay on screen while the answer is typed — they are
            the context the question was asked in — but nothing in them can be
            reached, by thumb or by Tab, until the row hands the step back. */}
        <div
          {...anchorAttrs}
          inert={custom.active}
          className={cn(
            "flex flex-col gap-5 transition-opacity duration-200",
            custom.active && "opacity-50",
          )}
        >
          {emptyState.empty && search && (
            <div className="create-inline-in flex flex-col items-start gap-3">
              <p className="text-sm text-ink-muted">{search.noMatchesLabel}</p>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => search.onUseQuery(emptyState.query)}
              >
                {search.queryAnswerLabel(emptyState.query)}
              </Button>
            </div>
          )}
          <ChoiceRuns
            gridRef={grid.ref}
            headline={headline}
            keyboardHint={keyboardHint}
            runs={runs}
            selectedId={selectedId}
            rovingId={rovingId}
            onSelect={onSelect}
            onKeyDown={grid.onKeyDown}
            onChipFocus={setFocusedId}
          />
        </div>
      </div>
    </div>
  );
}
