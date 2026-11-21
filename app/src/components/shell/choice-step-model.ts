export interface ChoiceOption {
  id: string;
  label: string;
}

export interface ChoiceSection {
  id: string;
  label?: string;
  options: readonly ChoiceOption[];
}

export interface ChoiceStepSearch {
  placeholder: string;
  reach: number;
  runsFor: (query: string) => readonly ChoiceSection[];
  noMatchesLabel: string;
  queryAnswerLabel: (query: string) => string;
  onUseQuery: (query: string) => void;
}

export interface ChoiceStepProps {
  headline: string;
  hint?: string;
  sections: readonly ChoiceSection[];
  selectedId: string | null;
  custom: { active: boolean; value: string };
  customLabel: string;
  customPlaceholder: string;
  continueLabel: string;
  cancelLabel: string;
  search?: ChoiceStepSearch;
  onSelect: (id: string) => void;
  onSelectCustom: () => void;
  onCancelCustom: () => void;
  onCustomChange: (value: string) => void;
  onContinue: () => void;
}

export const SEARCH_THRESHOLD = 16;

export function foldForSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase();
}

export function isChoiceSearchable(reach: number): boolean {
  return reach > SEARCH_THRESHOLD;
}

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

export type ChoiceEnterAction =
  | { kind: "pick"; id: string }
  | { kind: "useQuery" }
  | { kind: "none" };

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

export function choiceSearchEmptyState(
  matched: readonly ChoiceSection[],
  query: string,
): { empty: boolean; query: string } {
  const trimmed = query.trim();
  return { empty: matched.length === 0 && trimmed !== "", query: trimmed };
}
