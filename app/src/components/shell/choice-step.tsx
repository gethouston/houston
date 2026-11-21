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

const SIZES = {
  page: { frame: "mx-auto max-w-2xl gap-5", headline: "text-2xl font-normal" },
  compact: { frame: "gap-4", headline: "text-base font-medium" },
};

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
  onSelect,
  onSelectCustom,
  onCancelCustom,
  onCustomChange,
  onContinue,
  compact = false,
}: ChoiceStepProps & {
  keyboardHint?: string;
  compact?: boolean;
}) {
  const size = compact ? SIZES.compact : SIZES.page;
  const [query, setQuery] = useState("");
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

  const openCustom = () => {
    onSelectCustom();
    const seed = query.trim();
    if (seed) onCustomChange(seed);
  };

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    if (!search) return;
    const action = enterAction(runs, query);
    if (action.kind === "none") return;
    event.preventDefault();
    if (action.kind === "pick") onSelect(action.id);
    else search.onUseQuery(emptyState.query);
  };

  const leaveCustom = useLeaveWithFocus(
    custom.active,
    customRef,
    onCancelCustom,
  );

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
      <div className={cn("flex w-full flex-col", size.frame)}>
        <div className="flex flex-col gap-1.5">
          <h2 className={cn("text-balance", size.headline)}>{headline}</h2>
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

        <div
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
