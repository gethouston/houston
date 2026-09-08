import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Activity } from "../../data/activity";
import {
  getConversationStatus,
  useConversationStatus,
} from "../../hooks/use-conversation-vm";
import { queryKeys } from "../../lib/query-keys";
import { showStopFailedToast } from "../../lib/stop-error-toast";
import { tauriChat } from "../../lib/tauri";
import type { Agent } from "../../lib/types";
import { useUIStore } from "../../stores/ui";
import { createBoardConversation } from "./board-create-conversation";
import { sendBoardMessage } from "./board-send-message";
import type { SendOverrides } from "./board-source";
import {
  type BoardRows,
  deriveSessionLoading,
  rowSessionKey,
} from "./session-loading";

/**
 * Per-agent session loading + the create / send / stop / run-in-terminal
 * actions. `effectiveLoading` treats a session as busy whenever its activity
 * is running — not just when WE started it — so the chat keeps Stop/Esc live
 * for sessions kicked off elsewhere (routines, onboarding, Mission Control).
 * The rules live in `session-loading.ts`; this hook only gathers their inputs.
 *
 * Provider/model overrides are passed in (mirroring the composer dropdown)
 * rather than re-resolved, so the wire never silently routes to a different
 * model than the UI shows. The two send bodies live next door
 * (`board-create-conversation.ts`, `board-send-message.ts`); this hook binds
 * them to the agent, the query client, and the loading flags.
 */
export function useAgentBoardSend({
  agent,
  rawItems,
  openSessionKey,
  promptContext,
}: {
  agent: Agent;
  /**
   * The board rows behind this surface. `undefined` means the surface has NO
   * board at all (the assistant chat creates no activity record), which is a
   * different state from `[]` (a board whose rows have not landed yet) — see
   * {@link BoardRows}: only the first lets a settled conversation VM end the
   * spinner on its own.
   */
  rawItems: Activity[] | undefined;
  /** The conversation this surface has open: subscribed below, so the spinner
   *  tracks its turn lifecycle live instead of waiting on a row refetch. */
  openSessionKey: string | null;
  /**
   * Model-facing context prepended to EVERY outgoing prompt, hidden from the
   * chat (the bubble keeps the user's words via `displayText` / the
   * attachment marker). The skill setup chat pins its bound skill with this
   * so the model never has to remember it from the kickoff alone.
   */
  promptContext?: string;
}) {
  const { t } = useTranslation(["board", "chat", "common"]);
  const path = agent.folderPath;
  const addToast = useUIStore((s) => s.addToast);
  const queryClient = useQueryClient();
  const [loadingState, setLoading] = useState<Record<string, boolean>>({});

  // The open conversation's VM is SUBSCRIBED: it is what recomputes the rollup
  // the instant its turn settles. Background sessions are read synchronously
  // and re-derive on that publish or on the activity refetch (the
  // SessionStatus/ActivityChanged invalidations); their card status is the
  // host-persisted signal (the turn stream writes it at start and settle).
  const openStatus = useConversationStatus(path, openSessionKey);
  const effectiveLoading = useMemo(() => {
    const rows: BoardRows =
      rawItems === undefined
        ? { present: false }
        : {
            present: true,
            statusBySession: new Map(
              rawItems.map((a) => [rowSessionKey(a), a.status]),
            ),
          };
    return deriveSessionLoading({
      locallySent: loadingState,
      rows,
      openSessionKey,
      vmStatus: (key) =>
        key === openSessionKey ? openStatus : getConversationStatus(path, key),
    });
  }, [loadingState, rawItems, path, openSessionKey, openStatus]);

  const createConversation = useCallback(
    (args: { text: string; files: File[] } & SendOverrides) =>
      createBoardConversation(
        {
          path,
          agentId: agent.id,
          agentName: agent.name,
          agentColor: agent.color,
          queryClient,
          addToast,
          t,
          setSessionLoading: (sessionKey, loading) =>
            setLoading((prev) => ({ ...prev, [sessionKey]: loading })),
        },
        args,
      ),
    [path, agent.id, agent.name, agent.color, queryClient, addToast, t],
  );

  const sendMessageNow = useCallback(
    (
      sessionKey: string,
      text: string,
      files: File[],
      overrides: SendOverrides,
    ) =>
      sendBoardMessage(
        {
          path,
          agentId: agent.id,
          rawItems,
          promptContext,
          setSessionLoading: (key, loading) =>
            setLoading((prev) => ({ ...prev, [key]: loading })),
        },
        sessionKey,
        text,
        files,
        overrides,
      ),
    [path, agent.id, rawItems, promptContext],
  );

  const stopSession = useCallback(
    (sessionKey: string) => {
      // Stop must clear the card even when the runtime has no live turn to abort
      // (orphaned after an app restart, or a turn that errored without settling):
      // the engine settles the stuck activity off "running", so refetch the board
      // and the spinner — driven by `activity.status` — actually clears. A failed
      // stop surfaces as a toast; never swallow it (beta no-silent-failures rule).
      tauriChat
        .stop(path, sessionKey)
        .then(() => {
          queryClient.invalidateQueries({ queryKey: queryKeys.activity(path) });
        })
        .catch(showStopFailedToast);
    },
    [path, queryClient],
  );

  return { effectiveLoading, createConversation, sendMessageNow, stopSession };
}
