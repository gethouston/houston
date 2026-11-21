import { type KeyboardEventHandler, type RefObject, useId } from "react";
import { ChoiceChips } from "./choice-chips";
import { choiceQuestionAria } from "./choice-chips-model";
import type { ChoiceSection } from "./choice-step-model";

export function ChoiceRuns({
  gridRef,
  headline,
  keyboardHint,
  runs,
  selectedId,
  rovingId,
  onSelect,
  onKeyDown,
  onChipFocus,
}: {
  gridRef: RefObject<HTMLDivElement | null>;
  headline: string;
  keyboardHint?: string;
  runs: readonly ChoiceSection[];
  selectedId: string | null;
  rovingId: string | null;
  onSelect: (id: string) => void;
  onKeyDown?: KeyboardEventHandler<HTMLButtonElement>;
  onChipFocus?: (id: string) => void;
}) {
  const hintId = useId();
  const aria = choiceQuestionAria(headline, runs, {
    id: hintId,
    text: keyboardHint,
  });

  if (runs.length === 0) return null;

  return (
    <>
      <div ref={gridRef} {...aria.group} className="flex flex-col gap-5">
        {runs.map((section, index) => (
          <div key={section.id} className="flex flex-col gap-2.5">
            {section.label && (
              <p
                {...aria.headings[index]}
                className="text-sm font-medium text-ink"
              >
                {section.label}
              </p>
            )}
            <ChoiceChips
              options={section.options}
              selectedId={selectedId}
              rovingId={rovingId}
              onSelect={onSelect}
              onKeyDown={onKeyDown}
              onChipFocus={onChipFocus}
            />
          </div>
        ))}
      </div>
      {keyboardHint && (
        <span id={hintId} className="sr-only">
          {keyboardHint}
        </span>
      )}
    </>
  );
}
