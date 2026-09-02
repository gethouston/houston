import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Activity } from "../../data/activity";
import { getConversationStatus } from "../../hooks/use-conversation-vm";
import { analytics } from "../../lib/analytics";
import { buildAttachmentPrompt } from "../../lib/attachment-message";
import { createMission } from "../../lib/create-mission";
import { classifyFileKind } from "../../lib/file-kind";
import { maybeShowFirstMissionPrompt } from "../../lib/notification-nudge";
import { perfSpans } from "../../lib/perf-spans";
import { queryKeys } from "../../lib/query-keys";
import { formatVisibleMessageText } from "../../lib/queued-chat";
import { showSendFailedToast } from "../../lib/send-error-toast";
import { showStopFailedToast } from "../../lib/stop-error-toast";
import { tauriAttachments, tauriChat } from "../../lib/tauri";
import type { Agent } from "../../lib/types";
import { useAgentProvisioningStore } from "../../stores/agent-provisioning";
import { useUIStore } from "../../stores/ui";
import type { SendOverrides } from "./board-source";

/**
 * Per-agent session loading + the create / send / stop / run-in-terminal
 * actions. `effectiveLoading` treats a session as busy whenever its activity
 * is running — not just when WE started it — so the chat keeps Stop/Esc live
 * for sessions kicked off elsewhere (routines, onboarding, Mission Control).
 *
 * Provider/model overrides are passed in (mirroring the composer dropdown)
 * rather than re-resolved, so the wire never silently routes to a different
 * model than the UI shows.
 */
export function useAgentBoardSend({
  agent,
  rawItems,
  promptContext,
}: {
  agent: Agent;
  rawItems: Activity[] | undefined;
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

  // Reads the conversation VM's status synchronously; recomputes when the
  // activity list refetches (the SessionStatus/ActivityChanged invalidations)
  // or a local send flips `loadingState`. The card's activity status is the
  // host-persisted signal (the turn stream writes it at start and settle).
  const effectiveLoading = useMemo(() => {
    const out: Record<string, boolean> = {};
    const vmStatusFor = (key: string) => {
      const s = getConversationStatus(path, key);
      return s === "idle" ? undefined : s;
    };
    const activityStatusBySession = new Map<string, string>();
    for (const a of rawItems ?? []) {
      activityStatusBySession.set(
        a.session_key ?? `activity-${a.id}`,
        a.status,
      );
    }
    for (const [key, value] of Object.entries(loadingState)) {
      if (!value) continue;
      const knownStatus = vmStatusFor(key);
      const activityStatus = activityStatusBySession.get(key);
      if (!knownStatus && activityStatus && activityStatus !== "running")
        continue;
      if (!knownStatus || knownStatus === "running") out[key] = true;
    }
    for (const a of rawItems ?? []) {
      const key = a.session_key ?? `activity-${a.id}`;
      if (vmStatusFor(key) === "running") out[key] = true;
      if (a.status === "running") out[key] = true;
    }
    return out;
  }, [loadingState, rawItems, path]);

  const createConversation = useCallback(
    async ({
      text,
      files,
      providerOverride,
      modelOverride,
      modeOverride,
      mentions,
    }: { text: string; files: File[] } & SendOverrides) => {
      const visible = formatVisibleMessageText(text, files, (names) =>
        t("chat:queue.attached", { names }),
      );
      const { conversationId, sessionKey } = await createMission(
        {
          id: agent.id,
          name: agent.name,
          color: agent.color,
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
      setLoading((prev) => ({ ...prev, [sessionKey]: true }));
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
    },
    [path, agent.id, agent.name, agent.color, queryClient, addToast, t],
  );

  const sendMessageNow = useCallback(
    async (
      sessionKey: string,
      text: string,
      files: File[],
      overrides: SendOverrides,
    ) => {
      const activity = (rawItems ?? []).find(
        (a) => (a.session_key ?? `activity-${a.id}`) === sessionKey,
      );
      // Activity status flip (→ "running") is owned by the engine; don't
      // pre-write from the UI.
      const scopeId = activity ? `activity-${activity.id}` : sessionKey;
      // A follow-up into a still-warming agent parks with the same queue the
      // first message used (HOU-693): rendered now, delivered on ready. A
      // held wire send would die with infrastructure timeouts or a reload.
      const queuedWarm = useAgentProvisioningStore
        .getState()
        .queueWarmingSend(agent.id, {
          agentPath: path,
          sessionKey,
          text,
          // A builder also runs for a bare context send: the flush then
          // persists the clean `text` as the bubble (displayText), exactly
          // like the attachment case.
          buildPrompt:
            files.length > 0 || promptContext
              ? async () => {
                  const saved =
                    files.length > 0
                      ? await tauriAttachments.save(scopeId, files)
                      : [];
                  return buildAttachmentPrompt(
                    text,
                    files,
                    saved,
                    promptContext,
                  );
                }
              : undefined,
          provider: overrides.providerOverride,
          model: overrides.modelOverride,
          mode: overrides.modeOverride,
          mentions: overrides.mentions,
        });
      if (queuedWarm) {
        // The parked message narrates itself: the trailing user bubble keeps
        // the standard in-flight indicator on until the flushed turn takes
        // over (HOU-713). If the conversation's row is still queued (the
        // welcome mission settled to needs_you), flip it back to running —
        // the mission IS in progress again.
        if (activity) {
          useAgentProvisioningStore
            .getState()
            .setQueuedRowStatus(agent.id, activity.id, "running");
        }
        perfSpans.messageSent();
        analytics.track("chat_message_sent", {
          provider: overrides.providerOverride,
          model: overrides.modelOverride,
        });
        for (const f of files)
          analytics.track("file_attached", { file_kind: classifyFileKind(f) });
        return;
      }
      try {
        const paths = await tauriAttachments.save(scopeId, files);
        const prompt = buildAttachmentPrompt(text, files, paths, promptContext);
        await tauriChat.send(path, prompt, sessionKey, {
          providerOverride: overrides.providerOverride,
          modelOverride: overrides.modelOverride,
          modeOverride: overrides.modeOverride,
          mentions: overrides.mentions,
          // A context-prefixed prompt with no attachment marker would render
          // raw — persist the user's words as the bubble instead. (With
          // attachments the marker already carries them.)
          displayText: promptContext && files.length === 0 ? text : undefined,
          // If the conversation is mid-turn the adapter holds this send; the
          // queued bubble shows the user's words, not the built prompt.
          queuedPreview: {
            text,
            attachmentNames: files.map((f) => f.name),
          },
        });
        setLoading((prev) => ({ ...prev, [sessionKey]: true }));
        perfSpans.messageSent();
        analytics.track("chat_message_sent", {
          provider: overrides.providerOverride,
          model: overrides.modelOverride,
        });
        for (const f of files)
          analytics.track("file_attached", { file_kind: classifyFileKind(f) });
      } catch (err) {
        setLoading((prev) => ({ ...prev, [sessionKey]: false }));
        // The send failed BEFORE a turn stream existed — nothing wrote to the
        // VM, so surface it as a toast (no-silent-failures rule).
        showSendFailedToast(err);
        throw err;
      }
    },
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
