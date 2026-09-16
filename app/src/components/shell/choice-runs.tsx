import { type KeyboardEventHandler, type RefObject, useId } from "react";
import { ChoiceChips } from "./choice-chips";
import { choiceQuestionAria } from "./choice-chips-model";
import type { ChoiceSection } from "./choice-step-model";

/**
 * Every suggestion of one question, drawn as the labelled runs it reads best in
 * and announced as the single answer it is: ONE radio group around them all,
 * named for the question, with each run's heading read as the sighted label it
 * is rather than as a group of its own (`choice-chips-model.ts`).
 *
 * The group is also the element the arrow grid measures, so Up and Down cross
 * from the last row of one run into the next, and Home and End reach the first
 * and last answer of the question — the keyboard and the announcement describe
 * the same thing. The hint says that movement exists, once, because the group
 * is one: arrows on a run of pills are invisible until someone tries them.
 */
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
  /** The arrow grid measures its chips from here (`use-choice-keyboard.ts`). */
  gridRef: RefObject<HTMLDivElement | null>;
  /** The question itself, which is what the group is named for. */
  headline: string;
  /** Translated arrow-key hint; this component stays i18n-free. */
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

  // A query that matched nothing has no answers to group: an empty group would
  // be announced as one, and its box would still take the gap above the way
  // out the step offers instead.
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
