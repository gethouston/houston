import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { startTurnMissionTitle, turnTitleRunner } from "./turn-mission-title";
import type { InTreeMissionTitle } from "./turn-mission-title-outcome";
import type { RunTurnDeps } from "./turn-session-startup";
import type { TurnDirectories, TurnSessionRequest } from "./turn-session-types";

export interface PooledTurnTitle {
  start(): void;
  abandon(): void;
  settle(failed: boolean): Promise<InTreeMissionTitle | undefined>;
}

export function armPooledTurnTitle(input: {
  turn: TurnSessionRequest;
  deps: RunTurnDeps;
  directories: TurnDirectories;
  model: { id: string };
  modelRuntime: ModelRuntime;
}): PooledTurnTitle | null {
  const { turn, deps, directories } = input;
  const request = turn.missionTitle;
  if (!request || turn.signal?.aborted) return null;
  const cancel = new AbortController();
  let finish: (() => Promise<InTreeMissionTitle>) | undefined;
  const start = () => {
    if (finish || cancel.signal.aborted) return;
    finish = startTurnMissionTitle({
      conversationId: turn.conversationId,
      request,
      run:
        deps.titleRunner ??
        turnTitleRunner({
          provider: turn.provider,
          model: input.model,
          modelRuntime: input.modelRuntime,
          directories,
          claudeQuery: deps.claudeSdk?.query,
          claudePlan: turn.claudePlan,
        }),
      workspaceDir: directories.workspaceDir,
      cancel: cancel.signal,
      ...(turn.readRemoteActivity
        ? { readRemote: turn.readRemoteActivity }
        : {}),
    });
  };
  const abandon = () => cancel.abort();
  return {
    start,
    abandon,
    async settle(failed) {
      if (failed || turn.signal?.aborted) {
        abandon();
        return undefined;
      }
      start();
      return finish?.();
    },
  };
}
