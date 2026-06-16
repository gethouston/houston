import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChatPanel, type FeedItem } from "@houston-ai/chat";
import { HoustonAvatar, cn, resolveAgentColor } from "@houston-ai/core";
import { tauriAgent, tauriChat, tauriSystem } from "../../../lib/tauri";
import { logger } from "../../../lib/logger";
import { createMission } from "../../../lib/create-mission";
import { useSessionMessageQueue } from "../../../hooks/use-session-message-queue";
import { useQueuedMessageLabels } from "../../use-queued-message-labels";
import {
  appendSetupSection,
  stripSetupSection,
} from "../tutorial-system-prompt";
import { useFeedStore } from "../../../stores/feeds";
import {
  useSessionStatus,
  isActiveSessionStatus,
} from "../../../stores/session-status";
import { useChatDisplayLabels } from "../../use-chat-display-labels";
import { ComposioLinkCard } from "../../composio-link-card";
import { parseComposioToolkitFromHref } from "../../composio-card-state";
import { withComposioWaitingFooter } from "../../composio-waiting-footer";
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
 * Magic word the agent emits to signal "setup done, frontend may finish".
 * Stripped from display via `transformContent`, detected via a feed scan.
 * The regex is intentionally lenient because codex's gpt-5.5 sometimes wraps
 * the token in markdown (`**[TUTORIAL_COMPLETE]**`), escapes the underscore,
 * or pluralizes. (Kept as the internal agent↔UI protocol marker; it is not
 * user-facing copy.)
 */
const SETUP_END_RE = /\[\s*\\?TUTORIAL[_\s\\]+COMPLETED?\s*\]/i;
const SETUP_END_STRIP_RE =
  /\*{0,2}\[\s*\\?TUTORIAL[_\s\\]+COMPLETED?\s*\]\*{0,2}/gi;

interface FrameLabels {
  brandLabel: string;
  counterLabel: string;
  upNextLabel: string;
}

interface EmailMissionProps {
  meta: MissionMeta;
  frame: FrameLabels;
  agent: Agent;
  assistantColor: string;
  provider: string;
  model: string;
  /** Advance out of setup into the workspace shell (arms the guided tour). */
  onContinue: () => void;
  /**
   * Escape gate wired to the orchestrator. Framed as "set up later" rather
   * than a tutorial skip: lands the user in the workspace shell without
   * sending an email. Separate from `onContinue` only so the labels differ.
   */
  onSkip: () => void;
}

/**
 * First-run email setup. A single-sentence intro modal frames it ("send a real
 * email"), the CTA both dismisses the modal and kicks off the chat-driven
 * mission via `createMission`. From there the full screen is the chat: the
 * agent asks which provider, posts a Composio connect card inline, asks who to
 * email and what to say, sends it for real, and emits `[TUTORIAL_COMPLETE]`.
 * We finish setup when that token lands.
 */
export function EmailMission({
  meta,
  frame,
  agent,
  assistantColor,
  provider,
  model,
  onContinue,
  onSkip,
}: EmailMissionProps) {
  const { t } = useTranslation(["setup", "chat"]);
  const agentPath = agent.folderPath;
  const missionTitle = t("setup:tutorial.missions.email.chip");

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
   * `introDismissed` flips when the user clicks the modal CTA. The chip in the
   * chat area is gated on this so we never show two competing CTAs (modal +
   * chip) at once. `pickedAny` then flips when the chip itself is clicked,
   * which fires `createMission`.
   */
  const [introDismissed, setIntroDismissed] = useState(false);
  const [pickedAny, setPickedAny] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Append the setup directive to CLAUDE.md while this mission is mounted;
  // strip on unmount. Agent reads the augmented file at session start so the
  // directive lives in the system context, not in any visible chat bubble.
  // The write is async but the chip that spawns the session is synchronous
  // from the user's POV, so expose the prep promise via a ref and await it in
  // `handlePick` before firing `createMission`.
  const setupPrepRef = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    let cancelled = false;
    const prep = (async () => {
      try {
        const current = await tauriAgent.readFile(agentPath, "CLAUDE.md");
        const updated = appendSetupSection(current);
        if (cancelled || updated === current) return;
        await tauriAgent.writeFile(agentPath, "CLAUDE.md", updated);
      } catch (e) {
        logger.warn(`[email-setup] could not append setup section: ${e}`);
      }
    })();
    setupPrepRef.current = prep;
    return () => {
      cancelled = true;
      void (async () => {
        try {
          const current = await tauriAgent.readFile(agentPath, "CLAUDE.md");
          const stripped = stripSetupSection(current);
          if (stripped === current) return;
          await tauriAgent.writeFile(agentPath, "CLAUDE.md", stripped);
        } catch (e) {
          logger.warn(`[email-setup] could not strip setup section: ${e}`);
        }
      })();
    };
  }, [agentPath]);

  // Magic-word completion signal. Restricted to `assistant_text` so reasoning
  // / tool plumbing that incidentally mentions the marker doesn't false-fire.
  const finalReportMarkdown = useMemo(() => {
    for (let i = (feedItems ?? []).length - 1; i >= 0; i--) {
      const item = (feedItems ?? [])[i];
      if (item.feed_type !== "assistant_text") continue;
      const data = item.data;
      if (typeof data !== "string" || !SETUP_END_RE.test(data)) continue;
      return data.replace(SETUP_END_STRIP_RE, "").trim();
    }
    return null;
  }, [feedItems]);
  const setupDone = finalReportMarkdown !== null;

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
      return <ComposioLinkCard toolkit={toolkit} onOpen={onOpen} />;
    },
    [],
  );

  const transformContent = useCallback((content: string) => {
    const stripped = SETUP_END_RE.test(content)
      ? content.replace(SETUP_END_STRIP_RE, "").trim()
      : content;
    return withComposioWaitingFooter({ content: stripped });
  }, []);

  // Free-typing path. Wrapped by `useSessionMessageQueue` so messages typed
  // while the agent is mid-stream get queued instead of dropped. Force
  // `effort: "medium"` for both providers — without it Codex inherits whatever
  // sits in `~/.codex/config.toml`, and newer builds write an effort the
  // bundled CLI rejects, killing setup with "A local tool failed to start".
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
   * Escape gate when the agent stalls and never emits the completion token.
   * Stops the in-flight session, then calls `onSkip` so the parent lands the
   * user in the workspace shell. The `useEffect` cleanup still strips the
   * setup section from CLAUDE.md on unmount.
   */
  const handleSkip = useCallback(() => {
    if (missionSessionKey) {
      tauriChat.stop(agentPath, missionSessionKey).catch(console.error);
    }
    onSkip();
  }, [agentPath, missionSessionKey, onSkip]);

  // Modal CTA + initial-message handler. Mint an activity, send the chip text
  // as the first user prompt, and let the engine stream the response. From
  // then on the chat lives on `activity-${id}` so it shows up as a mission
  // card on the Activity Board after setup.
  const handlePick = useCallback(
    async (chipLabel: string) => {
      if (pickedAny) return;
      setPickedAny(true);
      // Wait for the setup-section append to land on disk so the engine reads
      // the augmented CLAUDE.md when it spawns the chat session.
      await setupPrepRef.current;
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
        pushFeedItem(agent.folderPath, result.sessionKey, {
          feed_type: "user_message",
          data: chipLabel,
        });
        setMissionSessionKey(result.sessionKey);
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
    ],
  );

  const visibleFeed = (feedItems ?? []) as FeedItem[];

  if (setupDone && finalReportMarkdown) {
    return (
      <TryDoneScreen
        brandLabel={frame.brandLabel}
        assistantName={agent.name}
        assistantColor={assistantColor}
        title={t("setup:tutorial.missions.email.doneTitle")}
        reportMarkdown={finalReportMarkdown}
        continueLabel={t("setup:tutorial.missions.email.continueChip")}
        onContinue={onContinue}
        skipLabel={t("setup:tutorial.missions.email.skip")}
        onSkip={handleSkip}
      />
    );
  }

  return (
    <>
      <MissionChatFrame
        meta={meta}
        brandLabel={frame.brandLabel}
        counterLabel={frame.counterLabel}
        skipLabel={t("setup:tutorial.missions.email.skip")}
        onSkip={handleSkip}
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
                placeholder={t("setup:tutorial.missions.email.placeholder")}
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
            // Pre-pick state. After the modal dismisses, the user lands on a
            // centered chip showing the actual prompt that's about to fly —
            // they click it themselves, so the next chat bubble feels like
            // their own action rather than something the modal auto-fired.
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
              {introDismissed && (
                <button
                  type="button"
                  onClick={() =>
                    void handlePick(t("setup:tutorial.missions.email.chip"))
                  }
                  disabled={pickedAny}
                  className={cn(
                    "h-10 rounded-full border border-black/15 bg-background px-5 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50",
                  )}
                >
                  {t("setup:tutorial.missions.email.chip")}
                </button>
              )}
            </div>
          )}
        </div>
      </MissionChatFrame>
      <MissionIntroModal
        open={!introDismissed}
        header={t("setup:tutorial.missionLabel", {
          title: t("setup:tutorial.missions.email.intro.title"),
        })}
        body={t("setup:tutorial.missions.email.intro.body")}
        ctaLabel={t("setup:tutorial.missions.email.intro.cta")}
        onCta={() => setIntroDismissed(true)}
      />
    </>
  );
}
