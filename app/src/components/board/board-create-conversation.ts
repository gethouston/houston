import type { QueryClient } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { analytics } from "../../lib/analytics";
import { buildAttachmentPrompt } from "../../lib/attachment-message";
import { createMission } from "../../lib/create-mission";
import { classifyFileKind } from "../../lib/file-kind";
import { maybeShowFirstMissionPrompt } from "../../lib/notification-nudge";
import { perfSpans } from "../../lib/perf-spans";
import { queryKeys } from "../../lib/query-keys";
import { formatVisibleMessageText } from "../../lib/queued-chat";
import { tauriAttachments } from "../../lib/tauri";
import type { ToastItem } from "../../stores/ui";
import type { SendOverrides } from "./board-source";

/**
 * The composer's "start a new mission" send, lifted out of the React layer
 * (`use-agent-board-send.ts` keeps the `useCallback` wrapper). Everything the
 * write needs is passed in, so the wire never silently routes to a different
 * agent or model than the UI shows.
 */
export interface CreateBoardConversationDeps {
  /** The active agent's folder path. */
  path: string;
  agentId: string;
  agentName: string;
  /** Optional, as on `Agent` and on `CreateMissionAgent`. */
  agentColor?: string;
  queryClient: QueryClient;
  addToast: (toast: Omit<ToastItem, "id">) => void;
  t: TFunction<["board", "chat", "common"]>;
  /** Marks the new session locally sent, which lights its spinner until the
   *  conversation VM or the board row takes over. */
  setSessionLoading: (sessionKey: string, loading: boolean) => void;
}

/** Create a conversation for the active agent and return its id. */
export async function createBoardConversation(
  deps: CreateBoardConversationDeps,
  {
    text,
    files,
    providerOverride,
    modelOverride,
    modeOverride,
    mentions,
  }: { text: string; files: File[] } & SendOverrides,
): Promise<string> {
  const {
    path,
    agentId,
    agentName,
    agentColor,
    queryClient,
    addToast,
    t,
    setSessionLoading,
  } = deps;
  const visible = formatVisibleMessageText(text, files, (names) =>
    t("chat:queue.attached", { names }),
  );
  const { conversationId, sessionKey } = await createMission(
    {
      id: agentId,
      name: agentName,
      color: agentColor,
      folderPath: path,
    },
    text,
    {
      providerOverride,
      modelOverride,
      modeOverride,
      mentions,
      titleText: visible,
      buildPrompt: async (activityId) => {
        const saved = await tauriAttachments.save(
          `activity-${activityId}`,
          files,
        );
        return buildAttachmentPrompt(text, files, saved);
      },
      // A composer send: the bubble must show before the row lands.
      optimistic: true,
    },
  );
  // The turn stream pushes the user bubble into the conversation VM
  // itself — no app-side optimistic push. Warming agents included: the
  // parked message shows the standard in-flight indicator (HOU-713).
  setSessionLoading(sessionKey, true);
  // First-mission pre-prompt: a contextual, one-time nudge to turn on
  // completion notifications, shown here — the moment a user kicks off a
  // mission — only when delivery isn't already granted and we've never
  // asked. Fire-and-forget; its own flags keep it one-time.
  void maybeShowFirstMissionPrompt({ addToast, t });
  // createMission bypassed useCreateActivity so invalidate manually.
  queryClient.invalidateQueries({ queryKey: queryKeys.activity(path) });
  analytics.track("mission_created", {
    provider: providerOverride,
    model: modelOverride,
  });
  perfSpans.messageSent();
  analytics.track("chat_message_sent", {
    provider: providerOverride,
    model: modelOverride,
  });
  for (const f of files)
    analytics.track("file_attached", { file_kind: classifyFileKind(f) });
  return conversationId;
}
