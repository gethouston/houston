import type {
  ChatMessage,
  ProviderError,
  TokenUsage,
  ToolCallRecord,
  WireFrame,
} from "@houston/runtime-client";
import { clearProviderMarks } from "../auth/credential-health";
import {
  type newUsedTokenCapture,
  runWithUsedTokenCapture,
} from "../auth/used-token";
import {
  diffSnapshots,
  type FileSnapshot,
  snapshotWorkspace,
} from "../session/file-changes";
import {
  type newInteractionHolder,
  planReadyFallback,
} from "../session/interaction";
import { appendAssistantMessageAt } from "../store/conversation-file";
import type { TurnOutcome, TurnSessionRequest } from "./turn-session-types";

export function captureWorkspaceSnapshot(
  workspaceDir: string,
): FileSnapshot | null {
  try {
    return snapshotWorkspace(workspaceDir);
  } catch (error) {
    console.warn(
      "[turn] file snapshot failed:",
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
}

export function finishSuccessfulTurn(input: {
  beforeFiles: FileSnapshot | null;
  providerError?: ProviderError;
  workspaceDir: string;
  mode: TurnSessionRequest["mode"];
  assistantText: string;
  interaction: ReturnType<typeof newInteractionHolder>;
  conversationsDir: string;
  conversationId: string;
  tools: ToolCallRecord[];
  usage: TokenUsage | null;
  compaction?: ChatMessage["compaction"];
  provider: string;
  turnId: string;
  usedTokens: ReturnType<typeof newUsedTokenCapture>;
  emit: (frame: WireFrame) => void;
}): TurnOutcome {
  let fileChanges: { created: string[]; modified: string[] } | undefined;
  if (input.beforeFiles && !input.providerError) {
    try {
      const changes = diffSnapshots(
        input.beforeFiles,
        snapshotWorkspace(input.workspaceDir),
      );
      if (changes.created.length || changes.modified.length)
        fileChanges = changes;
    } catch (error) {
      console.warn(
        "[turn] file diff failed:",
        error instanceof Error ? error.message : String(error),
      );
    }
  }
  const pendingInteraction =
    !input.providerError &&
    input.mode === "plan" &&
    input.assistantText.trim() &&
    !input.interaction.pending
      ? planReadyFallback()
      : input.interaction.pending;
  appendAssistantMessageAt(
    input.conversationsDir,
    input.conversationId,
    input.assistantText,
    {
      tools: input.tools,
      usage: input.usage,
      compaction: input.compaction,
      providerError: input.providerError,
      fileChanges,
      pendingInteraction: input.providerError ? undefined : pendingInteraction,
      turnId: input.turnId,
    },
  );
  if (fileChanges) input.emit({ type: "file_changes", data: fileChanges });
  if (!input.providerError)
    runWithUsedTokenCapture(input.usedTokens, () =>
      clearProviderMarks(input.provider),
    );
  return input.providerError ? {} : { pendingInteraction };
}
