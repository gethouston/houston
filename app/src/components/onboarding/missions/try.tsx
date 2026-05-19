import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChatPanel, type FeedItem } from "@houston-ai/chat";
import { HoustonAvatar, cn, resolveAgentColor } from "@houston-ai/core";
import {
  useConnectedToolkits,
  useConnections,
} from "../../../hooks/queries";
import { tauriAgent, tauriChat, tauriSystem } from "../../../lib/tauri";
import { logger } from "../../../lib/logger";
import { createMission } from "../../../lib/create-mission";
import { useSessionMessageQueue } from "../../../hooks/use-session-message-queue";
import { useQueuedMessageLabels } from "../../use-queued-message-labels";
import {
  appendTutorialSection,
  stripTutorialSection,
} from "../tutorial-system-prompt";
import { useFeedStore } from "../../../stores/feeds";
import {
  useSessionStatus,
  isActiveSessionStatus,
} from "../../../stores/session-status";
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
import { MissionChatFrame } from "../mission-chat-frame";
import { MissionIntroModal } from "../mission-intro-modal";
import { TryDoneScreen } from "../try-done-screen";

/**
 * Magic word the agent emits to signal "tutorial step done, frontend may
 * advance". Stripped from display via `transformContent`. Detected via a
 * feed scan in `tutorialDone`. The regex is intentionally lenient because
 * codex's gpt-5.5 sometimes wraps the token in markdown
 * (`**[TUTORIAL_COMPLETE]**`), escapes the underscore, or pluralizes.
 */
const TUTORIAL_END_RE = /\[\s*\\?TUTORIAL[_\s\\]+COMPLETED?\s*\]/i;
const TUTORIAL_END_STRIP_RE =
  /\*{0,2}\[\s*\\?TUTORIAL[_\s\\]+COMPLETED?\s*\]\*{0,2}/gi;

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
  /**
   * Reports the activity session key up to the orchestrator the moment
   * `createMission` mints it. The follow-up Skill and Routine missions
   * mount fresh `ChatPanel`s against the SAME session so the chat history
   * (the day-plan report) carries over without a re-fetch.
   */
  onSessionKey: (sessionKey: string) => void;
  onContinue: () => void;
  /**
   * Always-on escape hatch wired to the orchestrator. Bypasses the rest
   * of the tutorial and lands the user in the workspace shell. Separate
   * from `onContinue` because the latter advances to the next mission,
   * not the workspace.
   */
  onSkip: () => void;
}

/**
 * Onboarding mission 4. A single-sentence intro modal explains that
 * Houston agents connect to real tools, the CTA both dismisses the modal
 * and kicks off the day-plan mission via `createMission`. From there the
 * full screen is the chat: the user replies naturally, the agent runs
 * the structured day-plan flow, and we advance when the agent emits the
 * `[TUTORIAL_COMPLETE]` token.
 *
 * Why a modal instead of an inline tip card: the previous split-screen
 * put instructions to the LEFT of the chat. Users read the chat and
 * missed the left rail entirely. The modal forces the explanation in
 * front of the chat for one beat, then gets out of the way.
 */
export function TryMission({
  meta,
  frame,
  agent,
  assistantColor,
  provider,
  model,
  onSessionKey,
  onContinue,
  onSkip,
}: TryMissionProps) {
  const { t } = useTranslation(["setup", "chat"]);
  const agentPath = agent.folderPath;
  const missionTitle = t("setup:tutorial.missions.try.skill.title");

  const [missionSessionKey, setMissionSessionKey] = useState<string | null>(
    null,
  );
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
  /**
   * `introDismissed` flips to true the moment the user clicks the modal's
   * "Got it" / "Let's try that out" CTA. The chip in the chat area is
   * gated on this so we never show two competing CTAs (modal + chip) at
   * the same time. `pickedAny` then flips when the chip itself is clicked,
   * which is what actually fires `createMission`.
   */
  const [introDismissed, setIntroDismissed] = useState(false);
  const [pickedAny, setPickedAny] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: composioStatus } = useConnections();
  const isSignedIn = composioStatus?.status === "ok";
  const { data: connectedList } = useConnectedToolkits(isSignedIn);
  const connectedSet = useMemo(
    () => new Set(connectedList ?? []),
    [connectedList],
  );

  // Append the tutorial directive to CLAUDE.md while this mission is
  // mounted; strip on unmount. Agent reads the augmented file at session
  // start so the directive lives in the system context, not in any
  // visible chat bubble.
  //
  // The write is async, but the modal CTA that spawns the chat session is
  // synchronous from the user's POV. If the user clicks before this write
  // lands on disk the engine reads the un-augmented CLAUDE.md and the
  // tutorial directive never reaches the agent. We expose the prep
  // promise via a ref so `handlePick` can await it before firing
  // `createMission`.
  const tutorialPrepRef = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    let cancelled = false;
    const prep = (async () => {
      try {
        const current = await tauriAgent.readFile(agentPath, "CLAUDE.md");
        const updated = appendTutorialSection(current);
        if (cancelled || updated === current) return;
        await tauriAgent.writeFile(agentPath, "CLAUDE.md", updated);
      } catch (e) {
        logger.warn(`[try] could not append tutorial section: ${e}`);
      }
    })();
    tutorialPrepRef.current = prep;
    return () => {
      cancelled = true;
      void (async () => {
        try {
          const current = await tauriAgent.readFile(agentPath, "CLAUDE.md");
          const stripped = stripTutorialSection(current);
          if (stripped === current) return;
          await tauriAgent.writeFile(agentPath, "CLAUDE.md", stripped);
        } catch (e) {
          logger.warn(`[try] could not strip tutorial section: ${e}`);
        }
      })();
    };
  }, [agentPath]);

  // Magic-word completion signal. Restricted to `assistant_text` so
  // reasoning / tool plumbing that incidentally mentions the marker
  // doesn't false-positive.
  const finalReportMarkdown = useMemo(() => {
    for (let i = (feedItems ?? []).length - 1; i >= 0; i--) {
      const item = (feedItems ?? [])[i];
      if (item.feed_type !== "assistant_text") continue;
      const data = item.data;
      if (typeof data !== "string" || !TUTORIAL_END_RE.test(data)) continue;
      return data.replace(TUTORIAL_END_STRIP_RE, "").trim();
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
    if (!TUTORIAL_END_RE.test(content)) return { content };
    return { content: content.replace(TUTORIAL_END_STRIP_RE, "").trim() };
  }, []);

  // Free-typing path. Wrapped by `useSessionMessageQueue` so messages typed
  // while the agent is mid-stream get queued instead of dropped.
  //
  // Force `effort: "medium"` for both providers. Without it, Codex inherits
  // whatever sits in `~/.codex/config.toml`, and newer Codex builds happily
  // write `model_reasoning_effort = "xhigh"` which the bundled Codex CLI
  // rejects, killing the tutorial with "A local tool failed to start".
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
          effortOverride: "medium",
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

  /**
   * Escape hatch when the agent stalls and never emits the completion
   * token — observed real users sitting for minutes when codex + gpt-5.5
   * wraps the marker in markdown or just decides not to emit it. Stops
   * the in-flight session, then calls `onSkip` so the parent lands the
   * user in the workspace shell (bypassing Skill and Routine entirely).
   * The `useEffect` cleanup still strips the tutorial section from
   * CLAUDE.md on unmount.
   */
  const handleSkipTutorial = useCallback(() => {
    if (missionSessionKey) {
      tauriChat.stop(agentPath, missionSessionKey).catch(console.error);
    }
    onSkip();
  }, [agentPath, missionSessionKey, onSkip]);

  // Modal CTA + initial-message handler. Same flow as before: mint an
  // activity, send the chip text as the first user prompt, and let the
  // engine stream the response into the chat. From then on the chat
  // lives on `activity-${id}` so it shows up as a mission card on the
  // Activity Board after graduation.
  const handlePick = useCallback(
    async (chipLabel: string) => {
      if (pickedAny) return;
      setPickedAny(true);
      // Wait for the tutorial-section append to land on disk so the engine
      // reads the augmented CLAUDE.md when it spawns the chat session.
      await tutorialPrepRef.current;
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
            effortOverride: "medium",
          },
        );
        // Mirror the regular composer-send path: push the chip text as
        // the user_message into the feed the instant we have a session
        // key. Without this push the ChatPanel mounts with an empty feed
        // and the thinking indicator never gets a chance to render
        // before codex starts streaming items 1-2s later.
        pushFeedItem(agent.folderPath, result.sessionKey, {
          feed_type: "user_message",
          data: chipLabel,
        });
        setMissionSessionKey(result.sessionKey);
        onSessionKey(result.sessionKey);
      } catch (e) {
        setPickedAny(false);
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [
      agent.id,
      agent.name,
      agent.color,
      agent.folderPath,
      provider,
      model,
      pickedAny,
      pushFeedItem,
      onSessionKey,
    ],
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
        skipLabel={t("setup:tutorial.missions.try.skip")}
        onSkip={handleSkipTutorial}
      />
    );
  }

  return (
    <>
      <MissionChatFrame
        meta={meta}
        brandLabel={frame.brandLabel}
        counterLabel={frame.counterLabel}
        skipLabel={t("setup:tutorial.missions.try.skip")}
        onSkip={handleSkipTutorial}
      >
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
          {error && (
            <p className="mt-3 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
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
            // Pre-pick state. After the modal dismisses, the user lands on
            // a centered chip showing the actual prompt that's about to fly
            // — they click it themselves, so the next chat bubble feels like
            // their own action rather than something the modal auto-fired.
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
              {introDismissed && (
                <button
                  type="button"
                  onClick={() =>
                    void handlePick(t("setup:tutorial.missions.try.chip"))
                  }
                  disabled={pickedAny}
                  className={cn(
                    "h-10 rounded-full border border-black/15 bg-background px-5 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50",
                  )}
                >
                  {t("setup:tutorial.missions.try.chip")}
                </button>
              )}
            </div>
          )}
        </div>
      </MissionChatFrame>
      <MissionIntroModal
        open={!introDismissed}
        header={t("setup:tutorial.missionLabel", {
          title: t("setup:tutorial.missions.try.intro.title"),
        })}
        body={t("setup:tutorial.missions.try.intro.body")}
        ctaLabel={t("setup:tutorial.missions.try.intro.cta")}
        onCta={() => setIntroDismissed(true)}
      />
    </>
  );
}
