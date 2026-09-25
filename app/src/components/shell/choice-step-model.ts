/** One option of a choice step, as the user reads it. */
export interface ChoiceOption {
  id: string;
  label: string;
}

/** A labelled run of choices. The label is omitted for a single run. */
export interface ChoiceSection {
  id: string;
  label?: string;
  options: readonly ChoiceOption[];
}

/**
 * What a searchable question needs: the field's own copy, the runs a query
 * answers with, and the way out when it matches nothing. The runs are the
 * caller's to derive, because a filter need not stay inside the options on
 * screen (the role question searches the whole catalog).
 */
export interface ChoiceStepSearch {
  placeholder: string;
  /** How many options the filter can REACH, which is not what is on screen:
   *  the role question shows ten shared jobs and searches the whole catalog. */
  reach: number;
  runsFor: (query: string) => readonly ChoiceSection[];
  noMatchesLabel: string;
  /** Copy for taking the query itself as the answer, when nothing matches. */
  queryAnswerLabel: (query: string) => string;
  onUseQuery: (query: string) => void;
}

export interface ChoiceStepProps {
  headline: string;
  /** One quiet line under the headline, when the runs alone would mislead. */
  hint?: string;
  sections: readonly ChoiceSection[];
  selectedId: string | null;
  custom: { active: boolean; value: string };
  customLabel: string;
  customPlaceholder: string;
  continueLabel: string;
  /** The phone's way back out of the typed answer, where there is no Escape. */
  cancelLabel: string;
  /** Given, a filter field appears once the runs are long enough to need it. */
  search?: ChoiceStepSearch;
  onSelect: (id: string) => void;
  onSelectCustom: () => void;
  onCancelCustom: () => void;
  onCustomChange: (value: string) => void;
  onContinue: () => void;
}

/** Past this many reachable options the question is worth filtering. */
export const SEARCH_THRESHOLD = 16;

/** Accent-blind, case-blind matching, so "analisis" finds "Análisis". */
export function foldForSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase();
}

/**
 * A filter field earns its place once what it can REACH outgrows one glance —
 * which is not the same as what is on screen. The role question offers an
 * industry the user typed themselves the ten shared jobs alone and searches the
 * whole catalog behind them: judged by the run in front of it, the filter would
 * disappear and take the other eleven hundred roles with it.
 */
export function isChoiceSearchable(reach: number): boolean {
  return reach > SEARCH_THRESHOLD;
}

/**
 * The ONE chip of the whole question that holds the tab stop: wherever the
 * arrows last took the focus, else the picked chip, else the first in reading
 * order. The stop follows the arrows because leaving the question and coming
 * back by Tab must land where the user left off — a stop pinned to the pick
 * sends them back to the start of a hundred and eighty chips every time. A
 * query that filters that chip away falls through, so the run is never left
 * with its only way in on something nobody can see (the arrows walk the rest —
 * `use-choice-keyboard.ts`).
 */
export function rovingChipId(
  sections: readonly ChoiceSection[],
  selectedId: string | null,
  focusedId: string | null,
): string | null {
  const visible = sections.flatMap((run) => run.options.map((o) => o.id));
  if (focusedId !== null && visible.includes(focusedId)) return focusedId;
  if (selectedId !== null && visible.includes(selectedId)) return selectedId;
  return visible[0] ?? null;
}

/** What pressing Enter in the filter field means, given what the query found. */
export type ChoiceEnterAction =
  | { kind: "pick"; id: string }
  | { kind: "useQuery" }
  | { kind: "none" };

/**
 * Enter is the keyboard's click: it does whatever the query already put in
 * front of the user. A query with matches takes the first one in reading
 * order — the run is sorted the way it is scanned, so the first chip is the
 * one the eye is on. A query with no matches takes the typed words themselves,
 * which is the only thing on screen to take. An empty field has nothing to
 * mean, and guessing there would answer a question the user never asked.
 */
export function enterAction(
  sections: readonly ChoiceSection[],
  query: string,
): ChoiceEnterAction {
  if (query.trim() === "") return { kind: "none" };
  for (const section of sections) {
    const first = section.options[0];
    if (first) return { kind: "pick", id: first.id };
  }
  return { kind: "useQuery" };
}

/**
 * What the step offers when a query matches nothing: the typed words are
 * already the answer the user means, so the way out is to take them, not to
 * ask for a different search.
 */
export function choiceSearchEmptyState(
  matched: readonly ChoiceSection[],
  query: string,
): { empty: boolean; query: string } {
  const trimmed = query.trim();
  return { empty: matched.length === 0 && trimmed !== "", query: trimmed };
}
