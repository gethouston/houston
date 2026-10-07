import { isRoutineConversation } from "../session/routine-context";
import { runInTurnScope } from "./turn-scope";
import { type OpenedTurnHarness, openTurnHarness } from "./turn-session-open";
import { finishTurnSessionStartup } from "./turn-session-startup";
import type { TurnDirectories, TurnSessionRequest } from "./turn-session-types";
import type { TurnRequest } from "./types";

type EarlyOpen =
  | { kind: "opened"; harness: OpenedTurnHarness }
  | { kind: "failed"; error: unknown }
  /** Not a Claude session after all: the prompt path opens it, as always. */
  | { kind: "skipped" };

/**
 * A Claude turn's session, opened as soon as the tree is hydrated, with its
 * CLI spawned right away (ClaudeSession.warm), so the CLI's start overlaps
 * the worker's admission, its answer and the shared-skills snapshot instead
 * of following them.
 *
 * Nothing here runs before the turn's request: no credential exists before
 * it, and the template snapshot never holds a CLI. What it opens is what the
 * prompt path would open: the same request, the same hydrated tree, the
 * same turn scope (turn-scope.ts), and only reads and writes the session
 * open makes anyway (turn-session-open.ts). The prompt adopts it, or the
 * turn ends without one and `close` stops the CLI before the root goes.
 */
export interface EarlyTurnSession {
  readonly opened: Promise<EarlyOpen>;
  /** Stop the CLI if no prompt took it; resolves once it exited. */
  close(): Promise<void>;
}

/**
 * Open the session now when it is a Claude one this turn will prompt. A
 * routine chat is left to the prompt path: its context reset reads the
 * transcript row this turn appends first (turn-routine-context.ts).
 */
export function startEarlyTurnSession(input: {
  turn: TurnRequest;
  request: TurnSessionRequest;
  directories: TurnDirectories;
  authPath: string;
  poolStoreUrl: string | undefined;
}): EarlyTurnSession | undefined {
  const { turn, request } = input;
  const startup = request.startup;
  if (
    !startup ||
    request.provider !== "anthropic" ||
    turn.routine ||
    turn.shadow ||
    isRoutineConversation(turn.conversationId)
  )
    return undefined;
  const opened: Promise<EarlyOpen> = runInTurnScope(input, async () => {
    const setup = await finishTurnSessionStartup(startup);
    if (setup.backend.id !== "anthropic") return { kind: "skipped" as const };
    const harness = await openTurnHarness({
      directories: input.directories,
      turn: request,
      startup: setup,
      piResumeUnreadable: () => false,
    });
    harness.session.warm?.();
    return { kind: "opened" as const, harness };
  }).catch((error: unknown) => ({ kind: "failed" as const, error }));
  return {
    opened,
    async close() {
      const result = await opened;
      if (result.kind === "opened")
        await result.harness.session.releaseWarm?.();
    },
  };
}

/**
 * The session opened early, for the prompt path to run; undefined when it
 * must open its own. A failed early open fails the turn exactly where the
 * prompt path's own open would have.
 */
export async function adoptEarlyTurnSession(
  early: EarlyTurnSession | undefined,
): Promise<OpenedTurnHarness | undefined> {
  if (!early) return undefined;
  const result = await early.opened;
  if (result.kind === "failed") throw result.error;
  return result.kind === "opened" ? result.harness : undefined;
}
