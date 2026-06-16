import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChatPanel, type FeedItem } from "@houston-ai/chat";
import { Button, HoustonAvatar, resolveAgentColor } from "@houston-ai/core";
import { analytics } from "../../../lib/analytics";
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
import { SetupCard } from "../setup-card";

/**
 * Magic word the agent emits to signal "setup done". (Internal agent↔UI marker,
 * not user-facing copy; the regex is lenient because codex sometimes wraps or
 * escapes it.) When seen, the Continue footer unlocks.
 */
const SETUP_END_RE = /\[\s*\\?TUTORIAL[_\s\\]+COMPLETED?\s*\]/i;
const SETUP_END_STRIP_RE =
  /\*{0,2}\[\s*\\?TUTORIAL[_\s\\]+COMPLETED?\s*\]\*{0,2}/gi;

interface EmailMissionProps {
  eyebrow: string;
  agent: Agent;
  assistantColor: string;
  provider: string;
  model: string;
  onBack: () => void;
  /** Finish setup and enter the app (arms the guided tour). */
  onContinue: () => void;
  /** Escape gate if the agent stalls — lands the user in the app anyway. */
  onSkip: () => void;
}

/**
 * Final setup step: the assistant sends one real email. Lives in the same
 * SetupCard as every other step (eyebrow "Step N of N" + footer), with the
 * chat as the card content. Continue unlocks once the agent emits its
 * completion token (the email sent).
 */
export function EmailMission({
  eyebrow,
  agent,
  assistantColor,
  provider,
  model,
  onBack,
  onContinue,
  onSkip,
}: EmailMissionProps) {
  const { t } = useTranslation(["setup", "chat"]);
  const agentPath = agent.folderPath;

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
  const [pickedAny, setPickedAny] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Append the setup directive to CLAUDE.md while mounted; strip on unmount.
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

  const setupDone = useMemo(() => {
    for (let i = (feedItems ?? []).length - 1; i >= 0; i--) {
      const item = (feedItems ?? [])[i];
      if (item.feed_type !== "assistant_text") continue;
      if (typeof item.data === "string" && SETUP_END_RE.test(item.data)) {
        return true;
      }
    }
    return false;
  }, [feedItems]);

  // Funnel step 12 = CONVERSION (action): the assistant sent the first real
  // email (the agent emitted its completion token). `setupDone` is derived from
  // the feed, so guard with a ref to fire exactly once per install — strictly
  // before `onboarding_completed` (which fires when the user clicks Continue).
  const emailSentFired = useRef(false);
  useEffect(() => {
    if (setupDone && !emailSentFired.current) {
      emailSentFired.current = true;
      analytics.track("first_email_sent", { provider });
    }
  }, [setupDone, provider]);

  const handleOpenLink = useCallback((url: string) => {
    tauriSystem.openUrl(url).catch(console.error);
  }, []);

  const renderLink = useCallback(
    ({ href, onOpen }: { href: string; onOpen: () => void }) => {
      if (isComposioSigninHref(href)) return <ComposioSigninCard />;
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

  const handlePick = useCallback(
    async (chipLabel: string) => {
      if (pickedAny) return;
      setPickedAny(true);
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
        // Funnel step 10 (action): the user sent their first message. Guarded
        // by `pickedAny` above, so the success path runs once per install.
        analytics.track("first_message_sent");
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

  return (
    <SetupCard
      eyebrow={eyebrow}
      title={t("setup:tutorial.missions.email.title")}
      subtitle={
        missionSessionKey ? undefined : t("setup:tutorial.missions.email.body")
      }
      onBack={onBack}
      backLabel={t("setup:tutorial.nav.back")}
      onNext={onContinue}
      nextLabel={t("setup:tutorial.nav.continue")}
      nextDisabled={!setupDone}
      helper={
        <button
          type="button"
          onClick={onSkip}
          className="underline-offset-2 hover:text-foreground hover:underline"
        >
          {t("setup:tutorial.missions.email.skip")}
        </button>
      }
    >
      {error && (
        <p className="mb-3 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {missionSessionKey ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center gap-2 pb-3">
            <HoustonAvatar
              color={resolveAgentColor(assistantColor)}
              diameter={24}
              running={isActive}
            />
            <span className="truncate text-xs font-medium text-muted-foreground">
              {agent.name}
            </span>
          </div>
          <div className="flex min-h-0 flex-1 flex-col">
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
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center">
          <Button
            type="button"
            onClick={() =>
              void handlePick(t("setup:tutorial.missions.email.chip"))
            }
            disabled={pickedAny}
            className="h-11 rounded-full px-5"
          >
            {t("setup:tutorial.missions.email.chip")}
          </Button>
        </div>
      )}
    </SetupCard>
  );
}
