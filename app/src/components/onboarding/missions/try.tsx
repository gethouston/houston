import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChatPanel, type FeedItem } from "@houston-ai/chat";
import { HoustonAvatar, cn, resolveAgentColor } from "@houston-ai/core";
import {
  useConnectedToolkits,
  useConnections,
} from "../../../hooks/queries";
import { tauriAgent, tauriChat, tauriSystem } from "../../../lib/tauri";
import { createMission } from "../../../lib/create-mission";
import { useSessionMessageQueue } from "../../../hooks/use-session-message-queue";
import { useQueuedMessageLabels } from "../../use-queued-message-labels";
import {
  appendTutorialSection,
  stripTutorialSection,
} from "../tutorial-system-prompt";
import { useFeedStore } from "../../../stores/feeds";
import { useSessionStatus, isActiveSessionStatus } from "../../../stores/session-status";
import { useChatDisplayLabels } from "../../use-chat-display-labels";
import {
  ComposioLinkCard,
  parseComposioToolkitFromHref,
} from "../../composio-link-card";
import {
  ComposioSigninCard,
  isComposioSigninHref,
} from "../../composio-signin-card";
import type { Agent } from "../../../lib/types";
import type { MissionMeta } from "../mission-frame";
import { MissionWithChatFrame } from "../mission-with-chat-frame";
import { TryDoneScreen } from "../try-done-screen";

/**
 * Magic word the agent emits to signal "tutorial step done, frontend may
 * advance". Stripped from display via `transformContent`. Detected via a
 * feed scan in `tutorialDone`.
 */
const TUTORIAL_END_MARKER = "[TUTORIAL_COMPLETE]";

interface FrameLabels {
  brandLabel: string;
  counterLabel: string;
  upNextLabel: string;
}

interface TryMissionProps {
  meta: MissionMeta;
  frame: FrameLabels;
  agent: Agent;
  assistantColor: string;
  provider: string;
  model: string;
  onContinue: () => void;
}

/**
 * "Try a mission" — the AHA. The user clicks the single chip; we create a
 * real Activity Board mission via `createMission` and run the chat on the
 * resulting `activity-${id}` session key. After graduation the user lands on
 * the board and finds this conversation as a mission card they can scroll
 * back through.
 *
 * The composer is the workspace's `ChatPanel` (queue, attachments, Composio
 * cards — all free), so once the mission is going the user can reply in the
 * normal chat. Pre-pick the right column shows a centered prompt with the
 * single chip; post-pick it switches to the live chat layout.
 */
export function TryMission({
  meta,
  frame,
  agent,
  assistantColor,
  provider,
  model,
  onContinue,
}: TryMissionProps) {
  const { t } = useTranslation(["setup", "chat"]);
  const agentPath = agent.folderPath;
  const missionTitle = t("setup:tutorial.missions.try.skill.title");

  // The session key is null until the user picks a chip and `createMission`
  // mints the activity. Pre-pick everything that depends on it just no-ops.
  const [missionSessionKey, setMissionSessionKey] = useState<string | null>(null);
  const sessionKeyForHooks = missionSessionKey ?? "";
  const feedItems = useFeedStore(
    (s) => s.items[agentPath]?.[sessionKeyForHooks],
  );
  const pushFeedItem = useFeedStore((s) => s.pushFeedItem);
  const sessionStatus = useSessionStatus(agentPath, sessionKeyForHooks);
  const isActive = isActiveSessionStatus(sessionStatus);
  const { processLabels, getThinkingMessage } = useChatDisplayLabels();

  const [composerText, setComposerText] = useState("");
  const [composerFiles, setComposerFiles] = useState<File[]>([]);
  const [pickedAny, setPickedAny] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: composioStatus } = useConnections();
  const isSignedIn = composioStatus?.status === "ok";
  const { data: connectedList } = useConnectedToolkits(isSignedIn);
  const connectedSet = useMemo(
    () => new Set(connectedList ?? []),
    [connectedList],
  );

  // Append the tutorial directive to CLAUDE.md while this mission is mounted;
  // strip on unmount. Agent picks it up at session start so the tutorial flow
  // is enforced via system prompt, not user-visible postscripts.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const current = await tauriAgent.readFile(agentPath, "CLAUDE.md");
        const updated = appendTutorialSection(current);
        if (cancelled || updated === current) return;
        await tauriAgent.writeFile(agentPath, "CLAUDE.md", updated);
      } catch (e) {
        console.error("[try] could not append tutorial section:", e);
      }
    })();
    return () => {
      cancelled = true;
      void (async () => {
        try {
          const current = await tauriAgent.readFile(agentPath, "CLAUDE.md");
          const stripped = stripTutorialSection(current);
          if (stripped === current) return;
          await tauriAgent.writeFile(agentPath, "CLAUDE.md", stripped);
        } catch (e) {
          console.error("[try] could not strip tutorial section:", e);
        }
      })();
    };
  }, [agentPath]);

  // Magic-word completion signal. Restricted to `assistant_text` (the agent's
  // final visible reply) so reasoning / tool plumbing that incidentally
  // mentions the marker doesn't false-positive.
  const finalReportMarkdown = useMemo(() => {
    for (let i = (feedItems ?? []).length - 1; i >= 0; i--) {
      const item = (feedItems ?? [])[i];
      if (item.feed_type !== "assistant_text") continue;
      const data = item.data;
      if (typeof data !== "string" || !data.includes(TUTORIAL_END_MARKER)) continue;
      return data.replace(TUTORIAL_END_MARKER, "").trim();
    }
    return null;
  }, [feedItems]);
  const tutorialDone = finalReportMarkdown !== null;

  const handleOpenLink = useCallback((url: string) => {
    tauriSystem.openUrl(url).catch(console.error);
  }, []);

  const renderLink = useCallback(
    ({ href, onOpen }: { href: string; onOpen: () => void }) => {
      if (isComposioSigninHref(href)) {
        return <ComposioSigninCard />;
      }
      const toolkit = parseComposioToolkitFromHref(href);
      if (!toolkit) return undefined;
      return (
        <ComposioLinkCard
          toolkit={toolkit}
          isConnected={connectedSet.has(toolkit)}
          onOpen={onOpen}
        />
      );
    },
    [connectedSet],
  );

  const transformContent = useCallback((content: string) => {
    if (!content.includes(TUTORIAL_END_MARKER)) return { content };
    return { content: content.replace(TUTORIAL_END_MARKER, "").trim() };
  }, []);

  // Free-typing path. Wrapped by `useSessionMessageQueue` so messages typed
  // while the agent is mid-stream get queued instead of dropped — same
  // behavior as the workspace chat tab.
  const sendNow = useCallback(
    async (text: string, _files: File[]) => {
      const trimmed = text.trim();
      if (!trimmed || !missionSessionKey) return;
      pushFeedItem(agentPath, missionSessionKey, {
        feed_type: "user_message",
        data: trimmed,
      });
      try {
        await tauriChat.send(agentPath, trimmed, missionSessionKey, {
          providerOverride: provider,
          modelOverride: model,
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [agentPath, missionSessionKey, provider, model, pushFeedItem],
  );

  const messageQueue = useSessionMessageQueue({
    agentPath,
    sessionKey: missionSessionKey,
    isActive,
    sendNow,
  });
  const queuedLabels = useQueuedMessageLabels();

  const handleSend = useCallback(
    async (text: string, files: File[]) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      setComposerText("");
      setComposerFiles([]);
      await messageQueue.sendOrQueue(trimmed, files);
    },
    [messageQueue],
  );

  const handleStop = useCallback(() => {
    if (!missionSessionKey) return;
    tauriChat.stop(agentPath, missionSessionKey).catch(console.error);
  }, [agentPath, missionSessionKey]);

  // Chip click → `createMission` mints an activity, sends the chip text as
  // the first user prompt, and returns the session key. From then on the
  // chat lives on `activity-${id}` so it shows up as a mission card on the
  // Activity Board after graduation.
  const handlePick = useCallback(
    async (chipLabel: string) => {
      if (pickedAny) return;
      setPickedAny(true);
      try {
        const result = await createMission(
          {
            id: agent.id,
            name: agent.name,
            color: agent.color,
            folderPath: agent.folderPath,
          },
          chipLabel,
          {
            title: chipLabel,
            providerOverride: provider,
            modelOverride: model,
          },
        );
        setMissionSessionKey(result.sessionKey);
      } catch (e) {
        setPickedAny(false);
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [agent.id, agent.name, agent.color, agent.folderPath, provider, model, pickedAny],
  );

  const visibleFeed = (feedItems ?? []) as FeedItem[];

  if (tutorialDone && finalReportMarkdown) {
    return (
      <TryDoneScreen
        brandLabel={frame.brandLabel}
        assistantName={agent.name}
        assistantColor={assistantColor}
        title={t("setup:tutorial.missions.try.doneTitle")}
        reportMarkdown={finalReportMarkdown}
        continueLabel={t("setup:tutorial.missions.try.continueChip")}
        onContinue={onContinue}
      />
    );
  }

  return (
    <MissionWithChatFrame
      meta={meta}
      {...frame}
      left={
        <div className="flex flex-1 flex-col gap-4">
          <div className="rounded-xl border border-black/5 bg-secondary/40 p-4">
            <p className="text-sm font-medium">
              {t("setup:tutorial.missions.try.tipTitle")}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("setup:tutorial.missions.try.tipBody")}
            </p>
          </div>
          {pickedAny && (
            <div className="rounded-xl border border-black/5 bg-secondary/40 p-4">
              <p className="text-sm font-medium">
                {t("setup:tutorial.missions.try.workingTitle")}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {t("setup:tutorial.missions.try.workingBody")}
              </p>
            </div>
          )}
          {error && (
            <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      }
      right={
        <div className="flex h-full min-h-0 flex-col">
          <header className="flex shrink-0 items-center gap-3 border-b border-black/5 pb-4">
            <HoustonAvatar
              color={resolveAgentColor(assistantColor)}
              diameter={32}
              running={isActive}
            />
            <div className="flex min-w-0 flex-1 flex-col">
              <p className="truncate text-sm font-medium">{agent.name}</p>
              {pickedAny && (
                <p className="truncate text-xs text-muted-foreground">
                  {missionTitle}
                </p>
              )}
            </div>
          </header>
          {missionSessionKey ? (
            <div className="flex min-h-0 flex-1 flex-col pt-4">
              <ChatPanel
                sessionKey={missionSessionKey}
                feedItems={visibleFeed}
                onSend={handleSend}
                onStop={isActive ? handleStop : undefined}
                isLoading={isActive}
                placeholder={t("setup:tutorial.missions.try.placeholder")}
                processLabels={processLabels}
                getThinkingMessage={getThinkingMessage}
                renderLink={renderLink}
                onOpenLink={handleOpenLink}
                transformContent={transformContent}
                value={composerText}
                onValueChange={setComposerText}
                attachments={composerFiles}
                onAttachmentsChange={setComposerFiles}
                queuedMessages={messageQueue.queuedMessages}
                onRemoveQueuedMessage={messageQueue.removeQueuedMessage}
                queuedLabels={queuedLabels}
              />
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
              <p className="text-sm text-muted-foreground">
                {t("setup:tutorial.missions.try.composerHint")}
              </p>
              <button
                type="button"
                onClick={() =>
                  void handlePick(t("setup:tutorial.missions.try.chip"))
                }
                disabled={pickedAny}
                className={cn(
                  "h-9 rounded-full border border-black/15 bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50",
                )}
              >
                {t("setup:tutorial.missions.try.chip")}
              </button>
            </div>
          )}
        </div>
      }
    />
  );
}
