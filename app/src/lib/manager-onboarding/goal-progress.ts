// `.ts` extensions so the node test runner can import this module directly.

import type { FeedItem } from "@houston-ai/chat";
import { noticeEndsTurn } from "@houston/sdk/notice-ends-turn";

/**
 * How the person's goal is going, read from the manager's kickoff turn: the
 * goal card draws this instead of the manager's words. The manager staffs
 * the goal (hires someone new, or picks someone already on the team), then
 * starts the mission on that employee.
 */
export type GoalProgress =
  | { phase: "staffing"; hiring: string | null }
  | { phase: "assigning"; staff: GoalStaff }
  | { phase: "started"; staff: GoalStaff; mission: StartedGoalMission }
  /** The turn ended with no mission started. `reason` is the manager's own
   *  plain sentence, when it said one. */
  | { phase: "failed"; staff: GoalStaff | null; reason: string | null };

/** Who took the goal: a new hire by the name the manager gave, or an
 *  employee already on the team (known by name once the mission names it). */
export type GoalStaff =
  | { kind: "hired"; name: string }
  | { kind: "picked"; agent: string };

export interface StartedGoalMission {
  id: string;
  title: string;
  /** The employee the mission runs on, as the mission tool names it. */
  agent: string;
}

interface ToolRun {
  name: string;
  input: unknown;
  result: { isError: boolean; mission?: StartedGoalMission } | null;
}

const START_MISSION = "start_mission";
const HOUSTON_CALL = "houston_call";

/** A tool by its name, bare (pi) or namespaced by the Claude backend's MCP
 *  bridge (`mcp__houston__<name>`). */
function isTool(name: string, tool: string): boolean {
  return name === tool || name.endsWith(`__${tool}`);
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

/** The name a `createAgent` call hires, or null for any other call. */
function hireName(run: ToolRun): string | null {
  if (!isTool(run.name, HOUSTON_CALL)) return null;
  const input = record(run.input);
  if (input?.operation !== "createAgent") return null;
  const name = record(input.params)?.name;
  return typeof name === "string" && name.trim() !== "" ? name.trim() : null;
}

/** Each tool call with the result that answered it, in call order. */
function toolRuns(items: readonly FeedItem[]): ToolRun[] {
  const runs: ToolRun[] = [];
  for (const item of items) {
    if (item.feed_type === "tool_call")
      runs.push({ name: item.data.name, input: item.data.input, result: null });
    if (item.feed_type === "tool_result") {
      const named = item.data.name;
      const open = runs.find(
        (run) => run.result === null && (!named || run.name === named),
      );
      if (open)
        open.result = {
          isError: item.data.is_error,
          ...(item.data.mission ? { mission: item.data.mission } : {}),
        };
    }
  }
  return runs;
}

/** The employee already on the team a mission is being started on, before
 *  its result names them. */
function pickedFor(runs: readonly ToolRun[]): GoalStaff | null {
  const agent = record(
    runs.findLast((run) => isTool(run.name, START_MISSION))?.input,
  )?.agent;
  return typeof agent === "string" && agent !== ""
    ? { kind: "picked", agent }
    : null;
}

/** The turn is over: it settled, failed on a provider error, the chat
 *  wrote why it stopped (a send lost or refused, a stream that died, a turn
 *  that could not start), or the person wrote again. Which system lines end
 *  a turn is the SDK's call (`noticeEndsTurn`). */
function turnEnded(items: readonly FeedItem[]): boolean {
  return items.some(
    (item) =>
      item.feed_type === "final_result" ||
      item.feed_type === "provider_error" ||
      item.feed_type === "user_message" ||
      (item.feed_type === "system_message" && noticeEndsTurn(item.notice)),
  );
}

function lastWords(items: readonly FeedItem[]): string | null {
  const said = items.findLast((item) => item.feed_type === "assistant_text");
  const text = said?.feed_type === "assistant_text" ? said.data.trim() : "";
  return text === "" ? null : text;
}

/**
 * The goal's progress from the feed items the manager's kickoff turn has
 * produced so far (everything after the kickoff message). A hire the manager
 * retried under another name counts once it lands; only a turn that ends with
 * no mission started has failed.
 */
export function goalProgress(items: readonly FeedItem[]): GoalProgress {
  const runs = toolRuns(items);
  const hires = runs.flatMap((run) => {
    const name = hireName(run);
    return name === null ? [] : [{ name, run }];
  });
  const hired = hires.findLast(({ run }) => run.result?.isError === false);
  const mission = runs.findLast(
    (run) =>
      isTool(run.name, START_MISSION) &&
      run.result?.isError === false &&
      run.result.mission !== undefined,
  )?.result?.mission;

  if (mission) {
    const staff: GoalStaff = hired
      ? { kind: "hired", name: hired.name }
      : { kind: "picked", agent: mission.agent };
    return { phase: "started", staff, mission };
  }
  const staff: GoalStaff | null = hired
    ? { kind: "hired", name: hired.name }
    : pickedFor(runs);
  if (turnEnded(items))
    return { phase: "failed", staff, reason: lastWords(items) };
  if (staff) return { phase: "assigning", staff };
  return { phase: "staffing", hiring: hires.at(-1)?.name ?? null };
}
