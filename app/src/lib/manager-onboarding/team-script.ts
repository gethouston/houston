// `.ts` extensions so the node test runner can import this module directly.
import type { TeamView } from "../../components/onboarding/team/team-view-model.ts";
import type { ScriptLine, TeamQuestion } from "./script-types.ts";

/** One answer the person gave while building their team. */
export interface TeamEntry {
  question: TeamQuestion;
  /** A choice id, a catalog id, or the words shown (a hire, a team). */
  value: string;
  /** The screen the answer was given on: changing it returns there. */
  from: TeamView;
  /** The answer hired someone: it cannot be taken back by changing it. */
  locked: boolean;
}

/**
 * The team part of the conversation: which team screen the manager is asking
 * about (`team-view-model.ts`, the walk the team card takes), the answers
 * given on the way, and whether the team is finished. It opens straight on
 * the starter team: there is no question about how to build it.
 */
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

/** One answer as a card gives it. */
export interface TeamAnswer {
  question: TeamQuestion;
  value: string;
  locked?: boolean;
}

/** An answer on the current screen, moving on to `next`. */
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

/** Whether the latest answer can still be changed: until it hires anyone,
 *  going back (Change answer, or a step's Back) asks its question again. */
export function canUndoTeam(state: TeamConversation): boolean {
  const last = state.entries.at(-1);
  return !state.finished && last !== undefined && !last.locked;
}

/** Takes the latest answer back and asks its question again. */
export function teamUndo(state: TeamConversation): TeamConversation {
  if (!canUndoTeam(state)) return state;
  const last = state.entries[state.entries.length - 1];
  return { ...state, view: last.from, entries: state.entries.slice(0, -1) };
}

/** The team is built: the closing answer (the team hired, or "That's my
 *  team" on a resumed run; none when nothing was asked) is the last. */
export function teamFinished(
  state: TeamConversation,
  answer: Omit<TeamAnswer, "locked"> | null,
): TeamConversation {
  const entries = answer
    ? [...state.entries, { ...answer, from: state.view, locked: true }]
    : state.entries;
  return { ...state, entries, finished: true };
}

/** The team answers as conversation lines: each answer as the person's
 *  receipt, only the latest open to change until the team is hired. */
export function teamLines(state: TeamConversation): ScriptLine[] {
  const undoable = canUndoTeam(state);
  return state.entries.map((entry, index): ScriptLine => ({
    kind: "receipt",
    key: `team:${index}:${entry.question}`,
    question: entry.question,
    value: entry.value,
    editable: undoable && index === state.entries.length - 1,
  }));
}
