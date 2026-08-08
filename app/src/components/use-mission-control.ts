import type { KanbanItem } from "@houston-ai/board";
import type { FeedItem, MessageMention } from "@houston-ai/chat";
import { messagePreviewText } from "@houston-ai/chat";
import { useQueryClient } from "@tanstack/react-query";
import {
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { useAllConversations } from "../hooks/queries";
import { useUserProfiles } from "../hooks/queries/use-user-profiles";
import { useCapabilities } from "../hooks/use-capabilities";
import { getConversationStatus } from "../hooks/use-conversation-vm";
import { useWarmingConversations } from "../hooks/use-warming-conversations";
import { latestCachedAllConversations } from "../lib/all-conversations-cache";
import { sweepIsAuthoritative } from "../lib/all-conversations-recovery";
import { buildAttachmentPrompt } from "../lib/attachment-message";
import { createMission } from "../lib/create-mission";
import { isSetupChatMode } from "../lib/integration-chat-setup";
import { missionCardTags } from "../lib/mission-card";
import { armMissionDoneCelebration } from "../lib/mission-done-celebration";
import {
  buildMissionPeople,
  collectContributorIds,
} from "../lib/mission-people";
import { ARCHIVED_STATUS, DONE_STATUS } from "../lib/mission-selection";
import { isMultiplayer } from "../lib/org-roles";
import { perfSpans } from "../lib/perf-spans";
import { queryKeys } from "../lib/query-keys";
import { formatVisibleMessageText } from "../lib/queued-chat";
import {
  type HistoryLoadOptions,
  type RawConversation,
  tauriActivity,
  tauriAttachments,
  tauriChat,
} from "../lib/tauri";
import { DEFAULT_TURN_MODE } from "../lib/turn-mode";
import type { Agent } from "../lib/types";
import { mergeWarmingRows } from "../lib/warming-board-rows";
import { useUIStore } from "../stores/ui";
import { useMcOpenConversation } from "./board/use-mc-open-conversation";
import { resolveMissionControlSendOverrides } from "./mission-control-send";
import { AgentCardAvatar } from "./shell/agent-card-avatar";

export function useMissionControl(agents: Agent[]) {
  const { t } = useTranslation(["chat", "board"]);
  const queryClient = useQueryClient();
  const addToast = useUIStore((s) => s.addToast);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  // activityId → agentPath. Keyed by the activity id (the KanbanItem id), used
  // by the card-level handlers (delete/approve/archive/rename) on item.id.
  const pathMapRef = useRef<Record<string, string>>({});
  // session_key → { agentPath, activityId }. A routine chat's key is
  // `routine-{rid}`, NOT `activity-{id}`, so stripping an "activity-" prefix to
  // recover the agent fails for routines and the chat loads empty. Resolve by
  // the stored session_key directly instead (#381).
  const sessionMapRef = useRef<
    Record<string, { agentPath: string; activityId: string }>
  >({});

  const paths = useMemo(() => agents.map((a) => a.folderPath), [agents]);

  const {
    data: sweptConvos,
    isSuccess,
    isPlaceholderData,
    isError,
  } = useAllConversations(paths);
  // A FAILED sweep must never read as "you have no missions" (HOU-981). React
  // Query's `placeholderData` covers the pending state only, so on error the
  // board used to fall through to zero cards — and, because `isFetched` is true
  // on error too, it also auto-opened the new-mission composer over an empty
  // board while a toast said the read failed. Both are fixed here: on error the
  // last known rows (this key's own, or the newest disk-restored roster
  // variant) paint instead, and `isLoaded` waits for a genuine, SETTLED success
  // (`sweepIsAuthoritative` — TanStack calls the placeholder paint a success
  // too) so "empty" only ever means "successfully empty".
  // App-open → board perf mark (HOU-1011) for the DEFAULT surface: since
  // Everyone-first scope, the first mission cards a user sees come from THIS
  // cross-agent sweep, not a per-agent board (whose hook carries the same
  // mark — perfSpans latches once per session, so both firing is free).
  // Authoritative-settled only: a placeholder or failed sweep is not "the
  // user sees their cards". The rAF waits for the paint that shows them.
  const sweepSettled = sweepIsAuthoritative({ isSuccess, isPlaceholderData });
  useEffect(() => {
    if (!sweepSettled) return;
    if (typeof requestAnimationFrame === "function")
      requestAnimationFrame(() => perfSpans.boardRendered());
    else perfSpans.boardRendered();
  }, [sweepSettled]);

  const swept = useMemo(
    () =>
      sweptConvos ??
      (isError
        ? latestCachedAllConversations<RawConversation[]>(queryClient)
        : undefined),
    [sweptConvos, isError, queryClient],
  );
  // Missions started against a still-cold engine (HOU-713). Their board-row
  // write is held for the whole warm-up, and this is the only board they can
  // appear on now that agents have none of their own, so they are overlaid as
  // running cards until the flush's real rows arrive and win by id.
  const warming = useWarmingConversations(agents);
  const convos = useMemo(
    () => mergeWarmingRows(swept, warming as RawConversation[]),
    [swept, warming],
  );

  // Per-mission attribution (hosted Teams only): resolve the contributor ids on
  // every visible conversation to display profiles. Single-player never runs
  // the query (useUserProfiles is multiplayer-gated) and gets no `people` key,
  // so the board stays byte-identical to desktop.
  const { capabilities } = useCapabilities();
  const multiplayer = isMultiplayer(capabilities);
  const contributorIds = useMemo(
    () => (multiplayer && convos ? collectContributorIds(convos) : []),
    [multiplayer, convos],
  );
  const { profiles } = useUserProfiles(contributorIds);

  const agentColorMap = useMemo(() => {
    const m: Record<string, string | undefined> = {};
    for (const a of agents) m[a.folderPath] = a.color;
    return m;
  }, [agents]);
  const items: KanbanItem[] = useMemo(() => {
    if (!convos) return [];
    const map: Record<string, string> = {};
    const sessionMap: Record<
      string,
      { agentPath: string; activityId: string }
    > = {};
    const result = convos
      // Archived missions live in Mission Control's archived view — keep them
      // off the active board. Guided-setup chats (routine / skill / custom
      // integration) live in the team's own sections, never as a card.
      .filter(
        (c) =>
          c.type === "activity" &&
          c.status &&
          c.status !== ARCHIVED_STATUS &&
          !isSetupChatMode(c.agent),
      )
      .map((c) => {
        map[c.id] = c.agent_path;
        sessionMap[c.session_key] = {
          agentPath: c.agent_path,
          activityId: c.id,
        };
        const people = multiplayer ? buildMissionPeople(c, profiles) : [];
        return {
          id: c.id,
          title: c.title,
          // Decode a Skill / attachment first-message marker to the user's
          // words; never echo the raw `<!--houston:...-->` on the card (HOU-425).
          description: messagePreviewText(c.description),
          group: c.agent_name,
          icon: createElement(AgentCardAvatar, {
            color: agentColorMap[c.agent_path],
          }),
          status: c.status ?? "",
          updatedAt: c.updated_at ?? new Date().toISOString(),
          tags: missionCardTags({
            routineId: c.routine_id,
            routineLabel: t("board:tags.routine"),
          }),
          metadata: {
            agentPath: c.agent_path,
            sessionKey: c.session_key,
            ...(c.agent ? { agent: c.agent } : {}),
            ...(c.routine_id ? { routineId: c.routine_id } : {}),
          },
          ...(people.length > 0 ? { people } : {}),
        };
      });
    pathMapRef.current = map;
    sessionMapRef.current = sessionMap;
    return result;
  }, [convos, agentColorMap, multiplayer, profiles, t]);

  // Which conversation is open, and its live feed — including the beat after a
  // create, before the sweep has returned the new mission's row.
  const {
    activeSessionKey,
    activeAgentPath,
    activeVm,
    feedItems,
    hasOlderMessages,
    onLoadOlderMessages,
    rememberCreated,
  } = useMcOpenConversation(items, selectedId);

  const loadHistory = useCallback(
    async (
      sessionKey: string,
      opts?: HistoryLoadOptions,
    ): Promise<FeedItem[]> => {
      const agentPath = sessionMapRef.current[sessionKey]?.agentPath;
      if (!agentPath) return [];
      const history = await tauriChat.loadHistory(agentPath, sessionKey, opts);
      return history as FeedItem[];
    },
    [],
  );

  const handleDelete = useCallback(
    async (item: KanbanItem) => {
      const agentPath = pathMapRef.current[item.id];
      if (!agentPath) return;
      await tauriActivity.delete(agentPath, item.id);
      // Files attached in this conversation stay in the workspace's uploads/
      // folder — they are agent context, not conversation scratch (HOU-706).
      if (selectedId === item.id) setSelectedId(null);
    },
    [selectedId],
  );

  // The card checkmark: the user signing a mission off. Confetti fires only
  // after the write lands (a rejection propagates to the global error toast)
  // and only for a mission that actually succeeded — the checkmark also closes
  // failed missions, and those get the move without the fanfare. The burst is
  // armed before the write so it comes off the card the user just checked off
  // (full contract in armMissionDoneCelebration).
  const handleApprove = useCallback(async (item: KanbanItem) => {
    const agentPath = pathMapRef.current[item.id];
    if (!agentPath) return;
    const celebrate = armMissionDoneCelebration(item, DONE_STATUS);
    await tauriActivity.update(agentPath, item.id, { status: DONE_STATUS });
    celebrate();
  }, []);

  // The Done card's archive box: filing away a mission the user already signed
  // off. No confetti — the win was the checkmark, this is the tidy-up after it.
  // Archiving takes the card off the active board, so a mission whose chat is
  // open is deselected exactly as `handleDelete` and the bulk archive do it.
  const handleArchive = useCallback(
    async (item: KanbanItem) => {
      const agentPath = pathMapRef.current[item.id];
      if (!agentPath) return;
      await tauriActivity.update(agentPath, item.id, {
        status: ARCHIVED_STATUS,
      });
      if (selectedId === item.id) setSelectedId(null);
    },
    [selectedId],
  );

  const handleRename = useCallback(
    async (item: KanbanItem, newTitle: string) => {
      const agentPath = pathMapRef.current[item.id];
      if (!agentPath) return;
      await tauriActivity.update(agentPath, item.id, { title: newTitle });
    },
    [],
  );

  const handleSendMessage = useCallback(
    async (
      sessionKey: string,
      text: string,
      files: File[],
      mentions?: MessageMention[],
    ) => {
      const entry = sessionMapRef.current[sessionKey];
      if (!entry) return;
      const { agentPath, activityId } = entry;
      try {
        const paths = await tauriAttachments.save(
          `activity-${activityId}`,
          files,
        );
        const prompt = buildAttachmentPrompt(text, files, paths);
        // Mission Control is cross-agent: the activity's stored provider/model
        // is the per-activity override that the chat picker is showing. The
        // engine session router only reads agent config when no override is
        // sent, so dropping the activity's choice here routes the message to
        // whatever CLI the agent defaults to (e.g. agent=openai but activity
        // was created with Opus -> spawns codex instead of claude). Look the
        // activity up and forward its override pair to keep picker and wire
        // in agreement.
        const list = await tauriActivity.list(agentPath);
        const overrides = resolveMissionControlSendOverrides(sessionKey, list);
        // The turn stream pushes the user bubble into the conversation VM
        // itself — no app-side optimistic push. If the conversation is
        // mid-turn the adapter holds this send; the queued bubble shows the
        // user's words, not the built prompt.
        await tauriChat.send(agentPath, prompt, sessionKey, {
          ...overrides,
          mentions,
          queuedPreview: {
            text,
            attachmentNames: files.map((f) => f.name),
          },
        });
        setLoading((prev) => ({ ...prev, [sessionKey]: true }));
      } catch (err) {
        setLoading((prev) => ({ ...prev, [sessionKey]: false }));
        // The send failed BEFORE a turn stream existed (attachment save,
        // activity lookup, refused start) — nothing wrote to the VM, so
        // surface it as a toast, same as the create path below.
        addToast({
          title: t("errors.sessionStart", { error: String(err) }),
          variant: "error",
        });
        throw err;
      }
    },
    [addToast, t],
  );

  // Blank "New mission" create path for Mission Control. Mirrors the
  // per-agent BoardTab `handleCreateConversation` (it routes through the
  // same `createMission` source of truth) but takes the agent explicitly
  // because this view is cross-agent. Wired into AIBoard via
  // `onCreateConversation`; without it a blank submit had no handler and
  // the composer silently cleared (issue #328). AIBoard selects the
  // returned activity id, so we don't call setSelectedId here.
  const handleCreateConversation = useCallback(
    async (
      agent: Agent,
      text: string,
      files: File[],
      opts?: {
        providerOverride?: string;
        modelOverride?: string;
        /** Teammates the first message @mentions (HOU-944). */
        mentions?: MessageMention[];
      },
    ): Promise<string> => {
      const agentPath = agent.folderPath;

      try {
        const visible = formatVisibleMessageText(text, files, (names) =>
          t("queue.attached", { names }),
        );
        const { conversationId, sessionKey } = await createMission(
          {
            id: agent.id,
            name: agent.name,
            color: agent.color,
            folderPath: agentPath,
          },
          text,
          {
            providerOverride: opts?.providerOverride,
            modelOverride: opts?.modelOverride,
            mentions: opts?.mentions,
            modeOverride: DEFAULT_TURN_MODE,
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
        setLoading((prev) => ({ ...prev, [sessionKey]: true }));
        // Hold the new mission's identity until the sweep returns its row, so
        // the panel that just opened on it keeps a session key and an agent.
        rememberCreated({ activityId: conversationId, agentPath, sessionKey });
        sessionMapRef.current[sessionKey] = {
          agentPath,
          activityId: conversationId,
        };
        // createMission bypasses the activity mutation hooks, so refresh
        // the cross-agent conversation list manually.
        queryClient.invalidateQueries({
          queryKey: queryKeys.allConversations(paths),
        });
        return conversationId;
      } catch (err) {
        // No silent failures: createMission already rolled back the
        // half-created activity. Surface why the mission did not start so
        // the user can retry or report it.
        addToast({
          title: t("errors.sessionStart", { error: String(err) }),
          variant: "error",
        });
        throw err;
      }
    },
    [t, queryClient, paths, addToast, rememberCreated],
  );

  // Per-session run state. The conversation VM is the live source: the open
  // session's `activeFeed` subscription keeps this recomputing while its turn
  // runs; background sessions re-derive when the activity list refetches (the
  // SessionStatus/ActivityChanged invalidations), reading VM status
  // synchronously. "idle"/unpublished falls back to the card's activity
  // status, which the turn stream persists host-side at start and settle.
  const effectiveLoading = useMemo(() => {
    const out: Record<string, boolean> = {};
    const itemStatusBySession = new Map<string, string>();
    for (const item of items) {
      const sessionKey =
        (item.metadata?.sessionKey as string | undefined) ??
        `activity-${item.id}`;
      itemStatusBySession.set(sessionKey, item.status);
    }
    const vmStatusFor = (agentPath: string | undefined, sessionKey: string) => {
      // The open session reads its SUBSCRIBED vm (the reactive path — its
      // spinner updates as the turn streams and settles); background sessions
      // are read synchronously and re-derive on the activity refetch.
      const s =
        sessionKey === activeSessionKey && agentPath === (activeAgentPath ?? "")
          ? activeVm?.sessionStatus
          : agentPath
            ? getConversationStatus(agentPath, sessionKey)
            : undefined;
      return s === "idle" ? undefined : s;
    };
    for (const [sessionKey, value] of Object.entries(loading)) {
      if (!value) continue;
      const agentPath = sessionMapRef.current[sessionKey]?.agentPath;
      const status = vmStatusFor(agentPath, sessionKey);
      const activityStatus = itemStatusBySession.get(sessionKey);
      if (!status && activityStatus && activityStatus !== "running") {
        continue;
      }
      if (!status || status === "running") {
        out[sessionKey] = true;
      }
    }
    for (const item of items) {
      const sessionKey =
        (item.metadata?.sessionKey as string | undefined) ??
        `activity-${item.id}`;
      const agentPath = pathMapRef.current[item.id];
      if (
        item.status === "running" ||
        vmStatusFor(agentPath, sessionKey) === "running"
      ) {
        out[sessionKey] = true;
      }
    }
    return out;
  }, [items, loading, activeVm, activeSessionKey, activeAgentPath]);

  return {
    items,
    /** The swept rows BEFORE any board filtered them — the one view of the
     *  workspace where active and archived missions coexist. The surface
     *  router classifies a published nav target against these
     *  (`lib/board-surface-nav.ts`); neither board's items can, each holding
     *  only its own half. */
    rawConversations: convos,
    selectedId,
    setSelectedId,
    /** The open conversation's session key and agent path, with the
     *  just-created fallback applied. The panel reads BOTH from here so it can
     *  never disagree with the feed above. */
    activeSessionKey,
    activeAgentPath,
    loading: effectiveLoading,
    isLoaded: sweepIsAuthoritative({ isSuccess, isPlaceholderData }),
    feedItems,
    loadHistory,
    onLoadOlderMessages,
    hasOlderMessages,
    handleDelete,
    handleApprove,
    handleArchive,
    handleRename,
    handleSendMessage,
    handleCreateConversation,
  };
}
