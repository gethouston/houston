import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import {
  addressesMission,
  applyActivityUpdate,
  loadActivities,
  saveActivities,
  upsertById,
} from "@houston/domain";
import type { ClaudePlanBinding } from "../auth/claude-plan";
import { readAnthropicToken } from "../backends/claude/read-token";
import { withServedPlan } from "../backends/claude/served-plan";
import type { ClaudeQuery } from "../backends/claude/session";
import { titleWithClaude } from "../backends/claude/title";
import {
  type MissionTitleRequest,
  type MissionTitleRunner,
  runMissionTitle,
} from "../session/mission-title";
import { oneShotText } from "../session/one-shot";
import { TITLE_PROMPT } from "../session/title-prompt";
import { turnAuthStore } from "./turn-auth-store";
import { fsTextStore } from "./turn-fs-store";
import type { InTreeMissionTitle } from "./turn-mission-title-outcome";
import type {
  RemoteActivityReader,
  StoredBoard,
} from "./turn-mission-title-remote";
import { POOLED_TURN_TRANSPORT } from "./turn-pi-transport";
import type { TurnDirectories } from "./turn-session-types";

/**
 * The per-turn worker's title runner: the turn's OWN provider, model, model
 * runtime and hydrated per-request credential. Same compliance gate as every
 * title: anthropic runs through the Claude Agent SDK on the request's token,
 * never pi's in-process Anthropic client.
 */
export function turnTitleRunner(input: {
  provider: string;
  model: { id: string };
  modelRuntime: ModelRuntime;
  directories: TurnDirectories;
  claudeQuery?: ClaudeQuery;
  claudePlan?: ClaudePlanBinding;
}): MissionTitleRunner {
  if (input.provider === "anthropic") return claudeTitleRunner(input);
  const { workspaceDir } = input.directories;
  return (excerpt, signal) =>
    oneShotText({
      cwd: workspaceDir,
      model: input.model,
      modelRuntime: input.modelRuntime,
      systemPrompt: TITLE_PROMPT,
      prompt: excerpt,
      signal,
      transport: POOLED_TURN_TRANSPORT,
    });
}

export function claudeTitleRunner(input: {
  model: { id: string };
  directories: Pick<TurnDirectories, "workspaceDir" | "dataDir">;
  claudeQuery?: ClaudeQuery;
  claudePlan?: ClaudePlanBinding;
}): (excerpt: string, signal?: AbortSignal) => Promise<string> {
  const { workspaceDir, dataDir } = input.directories;
  return (excerpt, signal) =>
    titleWithClaude({
      excerpt,
      titlePrompt: TITLE_PROMPT,
      workspaceDir,
      readToken: () =>
        withServedPlan(
          readAnthropicToken(turnAuthStore(dataDir)),
          input.claudePlan,
        ),
      dataDir,
      modelId: input.model.id,
      ...(signal ? { signal } : {}),
      ...(input.claudeQuery ? { query: input.claudeQuery } : {}),
    });
}

/**
 * Title the mission's card in the hydrated tree, BEFORE sync-back, so the write
 * lands with the turn's other writes and `ActivityChanged` ships in the terminal
 * frame's `changed`. Written only while the card still shows the fallback it was
 * created with — a rename the user made meanwhile wins.
 *
 * The card is created concurrently with the send, so the tree hydrated at
 * dispatch often predates it. Then the board is re-read fresh from the store,
 * the turn's own board edits are merged onto it, and the tree's board becomes
 * THAT with the one card retitled, descended from the read (`adopt`): the
 * upload lands at the read's generation, and a write that beats it merges
 * three-way against the read, never by comparing clocks. A card found nowhere
 * is reported, never silently dropped.
 */
export async function writeMissionTitleInTree(
  workspaceDir: string,
  conversationId: string,
  title: string,
  fallback: string,
  readRemote?: RemoteActivityReader,
): Promise<"written" | "renamed" | "card_missing"> {
  const store = fsTextStore();
  const { items: local } = await loadActivities(store, workspaceDir);
  let items = local;
  let current = items.find((a) => addressesMission(a, conversationId));
  let stored: StoredBoard | null = null;
  if (!current && readRemote) {
    stored = await readRemote();
    items = stored?.items ?? [];
    current = items.find((a) => addressesMission(a, conversationId));
  }
  if (!current) {
    console.warn(
      `[mission-title] no card for ${conversationId} in the hydrated or stored board; keeping the fallback`,
    );
    return "card_missing";
  }
  if (current.title !== fallback) return "renamed";
  const next = applyActivityUpdate(
    current,
    { title },
    new Date().toISOString(),
  );
  await saveActivities(store, workspaceDir, upsertById(items, next));
  stored?.adopt();
  return "written";
}

/**
 * Start the title call now, overlapping the reply (turn-session-title.ts); the
 * returned `finish` awaits it, writes the card, and reports what happened.
 * Never rejects: a failed title or write keeps the fallback and is reported.
 * `cancel` drops a title whose turn failed; its `finish` is never called.
 */
export function startTurnMissionTitle(input: {
  conversationId: string;
  request: MissionTitleRequest;
  run: MissionTitleRunner;
  workspaceDir: string;
  readRemote?: RemoteActivityReader;
  timeoutMs?: number;
  cancel?: AbortSignal;
}): () => Promise<InTreeMissionTitle> {
  const started = performance.now();
  // The cap counts from `finish`, the reply's end, as when the title only
  // started there.
  let startCap: () => void = () => undefined;
  const capStart = new Promise<void>((resolve) => {
    startCap = resolve;
  });
  const pending = runMissionTitle(
    input.conversationId,
    input.request,
    input.run,
    input.timeoutMs,
    { capStart, ...(input.cancel ? { cancel: input.cancel } : {}) },
  );
  let waitStarted = 0;
  const report = (outcome: InTreeMissionTitle["outcome"]) => {
    const now = performance.now();
    return {
      outcome,
      ms: Math.round(now - started),
      waitMs: Math.round(now - waitStarted),
    };
  };
  return async () => {
    waitStarted = performance.now();
    startCap();
    const result = await pending;
    if ("miss" in result) return report(result.miss);
    try {
      const outcome = await writeMissionTitleInTree(
        input.workspaceDir,
        input.conversationId,
        result.title,
        input.request.fallback,
        input.readRemote,
      );
      if (outcome !== "written") return report(outcome);
      return {
        ...report(outcome),
        written: {
          conversationId: input.conversationId,
          title: result.title,
          fallback: input.request.fallback,
        },
      };
    } catch (err) {
      console.error(
        `[mission-title] card write failed for ${input.conversationId}; keeping the fallback:`,
        err instanceof Error ? err.message : String(err),
      );
      return report("write_failed");
    }
  };
}
