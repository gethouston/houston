import type { TeamView } from "../../components/onboarding/team/team-view-model.ts";
import type { ScriptLine, TeamQuestion } from "./script-types.ts";

export interface TeamEntry {
  question: TeamQuestion;
  value: string;
  from: TeamView;
  locked: boolean;
}

export interface TeamConversation {
  view: TeamView;
  entries: readonly TeamEntry[];
  finished: boolean;
}

export const TEAM_CONVERSATION_START: TeamConversation = {
  view: { kind: "basic", viaIndustry: false },
  entries: [],
  finished: false,
};

export interface TeamAnswer {
  question: TeamQuestion;
  value: string;
  locked?: boolean;
}

export function teamAnswer(
  state: TeamConversation,
  answer: TeamAnswer,
  next: TeamView,
): TeamConversation {
  const entry: TeamEntry = {
    question: answer.question,
    value: answer.value,
    from: state.view,
    locked: answer.locked === true,
  };
  return { ...state, view: next, entries: [...state.entries, entry] };
}

export function canUndoTeam(state: TeamConversation): boolean {
  const last = state.entries.at(-1);
  return !state.finished && last !== undefined && !last.locked;
}

export function teamUndo(state: TeamConversation): TeamConversation {
  if (!canUndoTeam(state)) return state;
  const last = state.entries[state.entries.length - 1];
  return { ...state, view: last.from, entries: state.entries.slice(0, -1) };
}

export function teamFinished(
  state: TeamConversation,
  answer: Omit<TeamAnswer, "locked"> | null,
): TeamConversation {
  const entries = answer
    ? [...state.entries, { ...answer, from: state.view, locked: true }]
    : state.entries;
  return { ...state, entries, finished: true };
}

export function teamLines(state: TeamConversation): ScriptLine[] {
  const undoable = canUndoTeam(state);
  return state.entries.map(
    (entry, index): ScriptLine => ({
      kind: "receipt",
      key: `team:${index}:${entry.question}`,
      question: entry.question,
      value: entry.value,
      editable: undoable && index === state.entries.length - 1,
    }),
  );
}
