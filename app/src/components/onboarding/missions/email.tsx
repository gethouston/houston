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
import { ComposioLinkCard } from "../../composio-link-card";
import { parseComposioToolkitFromHref } from "../../composio-card-state";
import { withComposioWaitingFooter } from "../../composio-waiting-footer";
import {
  ComposioSigninCard,
  isComposioSigninHref,
} from "../../composio-signin-card";
import type { Agent } from "../../../lib/types";
import { SetupCard } from "../setup-card";
import {
  OfferCard,
  RecipientCard,
  ProviderCard,
  type RecipientChoice,
  type ProviderChoice,
} from "./email-cards";

/** The agent emits this once the email actually sent (it's lenient because
 *  codex sometimes wraps/escapes the token). Unlocks the final success step. */
const SETUP_END_RE = /\[\s*\\?TUTORIAL[_\s\\]+COMPLETED?\s*\]/i;
const SETUP_END_STRIP_RE =
  /\*{0,2}\[\s*\\?TUTORIAL[_\s\\]+COMPLETED?\s*\]\*{0,2}/gi;

const FAKE_THINKING_MS = 3000;

type Phase =
  | "offer"
  | "thinking1"
  | "recipient"
  | "thinking2"
  | "provider"
  | "live";

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
 * Final setup step. The first beats are a FAKED guided flow (no agent): a card
 * replaces the composer, the user picks who to email + what to say + which
 * provider, with a brief "thinking" pause between beats. Only once the provider
 * is chosen do we spin up the REAL agent, pre-fed with every choice, and let it
 * connect the email IN the chat (the teaching moment) and send for real. The
 * fake transcript and the real one render in one continuous ChatPanel.
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

  const [phase, setPhase] = useState<Phase>("offer");
  const [fakeFeed, setFakeFeed] = useState<FeedItem[]>([]);
  const [recipient, setRecipient] = useState<RecipientChoice | null>(null);
  const [missionSessionKey, setMissionSessionKey] = useState<string | null>(
    null,
  );
  const [composerText, setComposerText] = useState("");
  const [composerFiles, setComposerFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);

  const { processLabels, getThinkingMessage } = useChatDisplayLabels();
  const queuedLabels = useQueuedMessageLabels();

  // Don't fire timers / setState after the step unmounts (navigation away).
  const mounted = useRef(true);
  const later = useCallback((fn: () => void, ms: number) => {
    window.setTimeout(() => {
      if (mounted.current) fn();
    }, ms);
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Strip the setup directive from CLAUDE.md on unmount (idempotent, and safe
  // even if we never appended it because the user bailed before the handoff).
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

  const pushFake = useCallback(
    (item: FeedItem) => setFakeFeed((f) => [...f, item]),
    [],
  );

  // Conversion: the agent emitted its completion token (the email sent).
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

  const emailSentFired = useRef(false);
  useEffect(() => {
    if (setupDone && !emailSentFired.current) {
      emailSentFired.current = true;
      analytics.track("first_email_sent", { provider });
    }
  }, [setupDone, provider]);

  // ── Scripted beats ───────────────────────────────────────────────────────

  const handleOffer = useCallback(() => {
    analytics.track("first_message_sent");
    pushFake({
      feed_type: "user_message",
      data: t("setup:tutorial.missions.email.offer.userSaid"),
    });
    setPhase("thinking1");
    later(() => {
      pushFake({
        feed_type: "assistant_text",
        data: t("setup:tutorial.missions.email.recipient.prompt"),
      });
      setPhase("recipient");
    }, FAKE_THINKING_MS);
  }, [later, pushFake, t]);

  const handleRecipient = useCallback(
    (choice: RecipientChoice) => {
      setRecipient(choice);
      if (choice.toMyself) {
        pushFake({
          feed_type: "user_message",
          data: t("setup:tutorial.missions.email.recipient.selfSaid"),
        });
      } else {
        pushFake({
          feed_type: "user_message",
          data: t("setup:tutorial.missions.email.recipient.otherSaid", {
            email: choice.email,
          }),
        });
        if (choice.message) {
          pushFake({ feed_type: "user_message", data: choice.message });
        }
      }
      setPhase("thinking2");
      later(() => {
        pushFake({
          feed_type: "assistant_text",
          data: t("setup:tutorial.missions.email.provider.prompt"),
        });
        setPhase("provider");
      }, FAKE_THINKING_MS);
    },
    [later, pushFake, t],
  );

  // ── Hand off to the real agent ─────────────────────────────────────────────

  const handleProvider = useCallback(
    async (choice: ProviderChoice) => {
      if (!recipient) return;
      setError(null);
      setPhase("live");
      // Pre-feed the agent every choice via CLAUDE.md, BEFORE the session spawns
      // (it reads CLAUDE.md at start), so it only has to connect + send.
      try {
        const current = await tauriAgent.readFile(agentPath, "CLAUDE.md");
        const updated = appendSetupSection(current, {
          toolkit: choice.toolkit,
          toolkitLabel: choice.label,
          toMyself: recipient.toMyself,
          recipientEmail: recipient.email,
          message: recipient.message,
        });
        if (updated !== current) {
          await tauriAgent.writeFile(agentPath, "CLAUDE.md", updated);
        }
      } catch (e) {
        logger.warn(`[email-setup] could not append setup section: ${e}`);
      }
      // The provider label reads as the user answering "which email do you use".
      try {
        const result = await createMission(
          {
            id: agent.id,
            name: agent.name,
            color: agent.color,
            folderPath: agent.folderPath,
          },
          choice.label,
          {
            title: choice.label,
            providerOverride: provider,
            modelOverride: model,
            effortOverride: "medium",
          },
        );
        pushFeedItem(agent.folderPath, result.sessionKey, {
          feed_type: "user_message",
          data: choice.label,
        });
        setMissionSessionKey(result.sessionKey);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setPhase("provider");
      }
    },
    [agent, agentPath, model, provider, pushFeedItem, recipient],
  );

  // ── Live composer (only used once the real agent is running) ───────────────

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

  // ── Render ─────────────────────────────────────────────────────────────────

  const feedItems = [...fakeFeed, ...((realFeed ?? []) as FeedItem[])];
  const thinking = phase === "thinking1" || phase === "thinking2";
  const isLoading = thinking || (phase === "live" && isActive);

  const composerOverride =
    phase === "offer" ? (
      <OfferCard onSend={handleOffer} />
    ) : phase === "recipient" ? (
      <RecipientCard onConfirm={handleRecipient} />
    ) : phase === "provider" ? (
      <ProviderCard onConfirm={handleProvider} />
    ) : thinking ? (
      // Blank the input while the (faked) agent "thinks".
      <div className="h-1" />
    ) : undefined;

  return (
    <SetupCard
      eyebrow={eyebrow}
      title={t("setup:tutorial.missions.email.title")}
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
            onSend={handleSend}
            onStop={phase === "live" && isActive ? handleStop : undefined}
            isLoading={isLoading}
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
            composerOverride={composerOverride}
          />
        </div>
      </div>
    </SetupCard>
  );
}
