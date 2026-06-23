import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChatPanel, type FeedItem } from "@houston-ai/chat";
import { HoustonAvatar, resolveAgentColor } from "@houston-ai/core";
import { analytics } from "../../../lib/analytics";
import { tauriAgent, tauriChat, tauriSystem } from "../../../lib/tauri";
import { logger } from "../../../lib/logger";
import { createMission } from "../../../lib/create-mission";
import { useSessionMessageQueue } from "../../../hooks/use-session-message-queue";
import { useQueuedMessageLabels } from "../../use-queued-message-labels";
import { appendSetupSection, stripSetupSection } from "../tutorial-system-prompt";
import { useFeedStore } from "../../../stores/feeds";
import {
  useSessionStatus,
  isActiveSessionStatus,
} from "../../../stores/session-status";
import { useChatDisplayLabels } from "../../use-chat-display-labels";
import { useFileToolRenderer } from "../../../hooks/use-file-tool-renderer";
import { ComposioLinkCard } from "../../composio-link-card";
import { parseComposioToolkitFromHref } from "../../composio-card-state";
import { withComposioWaitingFooter } from "../../composio-waiting-footer";
import {
  ComposioSigninCard,
  isComposioSigninHref,
} from "../../composio-signin-card";
import type { Agent } from "../../../lib/types";
import { SetupCard } from "../setup-card";
import { OfferCard } from "./email-cards";

/** The agent emits this once the email actually sent. */
const SETUP_END_RE = /\[\s*\\?TUTORIAL[_\s\\]+COMPLETED?\s*\]/i;
const SETUP_END_STRIP_RE =
  /\*{0,2}\[\s*\\?TUTORIAL[_\s\\]+COMPLETED?\s*\]\*{0,2}/gi;

interface EmailMissionProps {
  eyebrow: string;
  agent: Agent;
  assistantColor: string;
  provider: string;
  model: string;
  /** The email toolkit connected in the previous step (e.g. "gmail"). */
  emailToolkit: string;
  emailToolkitLabel: string;
  onBack: () => void;
  /** Advance to the success screen once the email is sent. */
  onContinue: () => void;
}

/**
 * Final onboarding step: the agent sends one real email to the user themselves.
 * The email is already connected (previous step), so this is just a single
 * "Send an email to myself" card; the agent reads the directive from CLAUDE.md
 * and sends. Auto-advances the moment the agent confirms.
 */
export function EmailMission({
  eyebrow,
  agent,
  assistantColor,
  provider,
  model,
  emailToolkit,
  emailToolkitLabel,
  onBack,
  onContinue,
}: EmailMissionProps) {
  const { t } = useTranslation(["setup", "chat"]);
  const agentPath = agent.folderPath;

  const [started, setStarted] = useState(false);
  const [missionSessionKey, setMissionSessionKey] = useState<string | null>(
    null,
  );
  const [composerText, setComposerText] = useState("");
  const [composerFiles, setComposerFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Same chat-rendering hooks the real agent chat uses, so the onboarding chat
  // shows the agent's actual tool calls/results + a proper thinking + end-of-
  // turn indicator, not just a bare "thinking".
  const { processLabels, getThinkingMessage, thinkingIndicator, endOfTurnIndicator } =
    useChatDisplayLabels();
  const { isSpecialTool, renderToolResult, renderTurnSummary } =
    useFileToolRenderer(agentPath);
  const queuedLabels = useQueuedMessageLabels();

  // Strip the setup directive from CLAUDE.md on unmount (idempotent).
  useEffect(() => {
    return () => {
      void (async () => {
        try {
          const current = await tauriAgent.readFile(agentPath, "CLAUDE.md");
          const stripped = stripSetupSection(current);
          if (stripped !== current) {
            await tauriAgent.writeFile(agentPath, "CLAUDE.md", stripped);
          }
        } catch (e) {
          logger.warn(`[email-setup] could not strip setup section: ${e}`);
        }
      })();
    };
  }, [agentPath]);

  const sessionKeyForHooks = missionSessionKey ?? "";
  const realFeed = useFeedStore((s) => s.items[agentPath]?.[sessionKeyForHooks]);
  const pushFeedItem = useFeedStore((s) => s.pushFeedItem);
  const sessionStatus = useSessionStatus(agentPath, sessionKeyForHooks);
  const isActive = isActiveSessionStatus(sessionStatus);

  const setupDone = useMemo(() => {
    const items = realFeed ?? [];
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      if (item.feed_type !== "assistant_text") continue;
      if (typeof item.data === "string" && SETUP_END_RE.test(item.data)) {
        return true;
      }
    }
    return false;
  }, [realFeed]);

  // Conversion + auto-advance to the success screen the moment it sends.
  const doneFired = useRef(false);
  useEffect(() => {
    if (setupDone && !doneFired.current) {
      doneFired.current = true;
      analytics.track("first_email_sent", { provider });
      onContinue();
    }
  }, [setupDone, provider, onContinue]);

  const handleSend = useCallback(async () => {
    if (started) return;
    setStarted(true);
    setError(null);
    analytics.track("first_message_sent");
    // Pre-feed the agent (send to self via the already-connected toolkit).
    try {
      const current = await tauriAgent.readFile(agentPath, "CLAUDE.md");
      const updated = appendSetupSection(current, {
        toolkit: emailToolkit,
        toolkitLabel: emailToolkitLabel,
        toMyself: true,
      });
      if (updated !== current) {
        await tauriAgent.writeFile(agentPath, "CLAUDE.md", updated);
      }
    } catch (e) {
      logger.warn(`[email-setup] could not append setup section: ${e}`);
    }
    try {
      // The kickoff IS the user-visible message (the session echoes it into the
      // feed), so use the button's text — the directive in CLAUDE.md tells the
      // agent to send to self.
      const result = await createMission(
        {
          id: agent.id,
          name: agent.name,
          color: agent.color,
          folderPath: agent.folderPath,
        },
        t("setup:tutorial.missions.email.offer.option"),
        {
          title: emailToolkitLabel,
          providerOverride: provider,
          modelOverride: model,
          effortOverride: "medium",
        },
      );
      setMissionSessionKey(result.sessionKey);
    } catch (e) {
      setStarted(false);
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [
    started,
    agent,
    agentPath,
    emailToolkit,
    emailToolkitLabel,
    provider,
    model,
    t,
  ]);

  // Live composer (only used if the user wants to chat after).
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

  const handleComposerSend = useCallback(
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

  const feedItems = (realFeed ?? []) as FeedItem[];
  const isLoading = started && isActive;

  return (
    <SetupCard
      eyebrow={eyebrow}
      title={t("setup:tutorial.missions.email.title")}
      subtitle={started ? undefined : t("setup:tutorial.missions.email.body")}
      onBack={onBack}
      backLabel={t("setup:tutorial.nav.back")}
    >
      {error && (
        <p className="mb-3 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center gap-2 pb-3">
          <HoustonAvatar
            color={resolveAgentColor(assistantColor)}
            diameter={24}
            running={isLoading}
          />
          <span className="truncate text-xs font-medium text-muted-foreground">
            {agent.name}
          </span>
        </div>
        <div className="flex min-h-0 flex-1 flex-col">
          <ChatPanel
            sessionKey={missionSessionKey ?? "setup-wizard"}
            feedItems={feedItems}
            onSend={handleComposerSend}
            onStop={started && isActive ? handleStop : undefined}
            isLoading={isLoading}
            placeholder={t("setup:tutorial.missions.email.placeholder")}
            processLabels={processLabels}
            getThinkingMessage={getThinkingMessage}
            thinkingIndicator={thinkingIndicator}
            endOfTurnIndicator={endOfTurnIndicator}
            isSpecialTool={isSpecialTool}
            renderToolResult={renderToolResult}
            renderTurnSummary={renderTurnSummary}
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
            composerOverride={
              started ? undefined : <OfferCard onSend={handleSend} />
            }
          />
        </div>
      </div>
    </SetupCard>
  );
}
