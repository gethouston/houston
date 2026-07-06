import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Activity } from "../../data/activity";
import { getConversationStatus } from "../../hooks/use-conversation-vm";
import { analytics } from "../../lib/analytics";
import { buildAttachmentPrompt } from "../../lib/attachment-message";
import { createMission } from "../../lib/create-mission";
import { classifyFileKind } from "../../lib/file-kind";
import { queryKeys } from "../../lib/query-keys";
import { formatVisibleMessageText } from "../../lib/queued-chat";
import { tauriAttachments, tauriChat } from "../../lib/tauri";
import type { Agent, AgentDefinition } from "../../lib/types";
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
  agentDef,
  rawItems,
  pendingAgentMode,
  setPendingAgentMode,
}: {
  agent: Agent;
  agentDef: AgentDefinition;
  rawItems: Activity[] | undefined;
  pendingAgentMode: string | null;
  setPendingAgentMode: (mode: string | null) => void;
}) {
  const { t } = useTranslation(["board", "chat"]);
  const path = agent.folderPath;
  const agentModes = agentDef.config.agents;
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
    }: { text: string; files: File[] } & SendOverrides) => {
      const agentMode = pendingAgentMode ?? agentModes?.[0]?.id;
      const mode = agentModes?.find((m) => m.id === agentMode);
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
          agentMode,
          promptFile: mode?.promptFile,
          providerOverride,
          modelOverride,
          titleText: visible,
          buildPrompt: async (activityId) => {
            const saved = await tauriAttachments.save(
              `activity-${activityId}`,
              files,
            );
            return buildAttachmentPrompt(text, files, saved);
          },
        },
      );
      // The turn stream pushes the user bubble into the conversation VM
      // itself — no app-side optimistic push.
      setLoading((prev) => ({ ...prev, [sessionKey]: true }));
      setPendingAgentMode(null);
      // createMission bypassed useCreateActivity so invalidate manually.
      queryClient.invalidateQueries({ queryKey: queryKeys.activity(path) });
      analytics.track("mission_created", {
        agent_mode: agentMode ?? "default",
      });
      analytics.track("chat_message_sent");
      for (const f of files)
        analytics.track("file_attached", { file_kind: classifyFileKind(f) });
      return conversationId;
    },
    [
      path,
      agent.id,
      agent.name,
      agent.color,
      pendingAgentMode,
      agentModes,
      queryClient,
      t,
      setPendingAgentMode,
    ],
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
      const warmingMode = agentModes?.find((m) => m.id === activity?.agent);
      const queuedWarm = useAgentProvisioningStore
        .getState()
        .queueWarmingSend(agent.id, {
          agentPath: path,
          sessionKey,
          text,
          buildPrompt:
            files.length > 0
              ? async () => {
                  const saved = await tauriAttachments.save(scopeId, files);
                  return buildAttachmentPrompt(text, files, saved);
                }
              : undefined,
          promptFile: warmingMode?.promptFile,
          provider: overrides.providerOverride,
          model: overrides.modelOverride,
        });
      if (queuedWarm) {
        setLoading((prev) => ({ ...prev, [sessionKey]: true }));
        analytics.track("chat_message_sent");
        for (const f of files)
          analytics.track("file_attached", { file_kind: classifyFileKind(f) });
        return;
      }
      try {
        const paths = await tauriAttachments.save(scopeId, files);
        const prompt = buildAttachmentPrompt(text, files, paths);
        const mode = agentModes?.find((m) => m.id === activity?.agent);
        await tauriChat.send(path, prompt, sessionKey, {
          mode: mode?.promptFile,
          providerOverride: overrides.providerOverride,
          modelOverride: overrides.modelOverride,
          // If the conversation is mid-turn the adapter holds this send; the
          // queued bubble shows the user's words, not the built prompt.
          queuedPreview: {
            text,
            attachmentNames: files.map((f) => f.name),
          },
        });
        setLoading((prev) => ({ ...prev, [sessionKey]: true }));
        analytics.track("chat_message_sent");
        for (const f of files)
          analytics.track("file_attached", { file_kind: classifyFileKind(f) });
      } catch (err) {
        setLoading((prev) => ({ ...prev, [sessionKey]: false }));
        // The send failed BEFORE a turn stream existed — nothing wrote to the
        // VM, so surface it as a toast (no-silent-failures rule).
        addToast({
          title: t("chat:errors.sessionStart", { error: String(err) }),
          variant: "error",
        });
        throw err;
      }
    },
    [path, agent.id, addToast, rawItems, agentModes, t],
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
        .catch((err) => {
          addToast({
            title: t("chat:errors.stopSession", { error: String(err) }),
            variant: "error",
          });
        });
    },
    [path, queryClient, addToast, t],
  );

  return { effectiveLoading, createConversation, sendMessageNow, stopSession };
}
