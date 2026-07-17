import type { FeedItem, QueuedChatMessage } from "@houston-ai/chat";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useConversationVm } from "../../../hooks/use-conversation-vm";
import { useSessionMessageQueue } from "../../../hooks/use-session-message-queue";
import { analytics } from "../../../lib/analytics";
import { createMission } from "../../../lib/create-mission";
import { tauriChat } from "../../../lib/tauri";
import type { Agent } from "../../../lib/types";
import {
  prepareEmailMissionSetup,
  useEmailSetupCleanup,
  useEmailSetupCompleted,
} from "./email-mission-setup";
import { feedShowsTurnError, shouldOfferSkip } from "./email-skip";

interface UseEmailMissionSessionArgs {
  agent: Agent;
  provider: string;
  model: string;
  /** The email toolkit connected in the previous step (e.g. "gmail"). */
  emailToolkit: string;
  emailToolkitLabel: string;
  /** Advance to the success screen once the email is sent. */
  onContinue: () => void;
}

export interface EmailMissionSession {
  /** The "send to myself" kickoff has fired (chat replaces the offer card). */
  started: boolean;
  /** The mission session is currently working. */
  isLoading: boolean;
  error: string | null;
  feedItems: FeedItem[];
  sessionKey: string;
  /** Available only when something failed (kickoff or turn error). */
  showSkip: boolean;
  onStop: (() => void) | undefined;
  handleSend: () => Promise<void>;
  handleComposerSend: (text: string, files: File[]) => Promise<void>;
  queuedMessages: QueuedChatMessage[];
  removeQueuedMessage: (id: string) => void;
}

export function useEmailMissionSession({
  agent,
  provider,
  model,
  emailToolkit,
  emailToolkitLabel,
  onContinue,
}: UseEmailMissionSessionArgs): EmailMissionSession {
  const { t } = useTranslation("setup");
  const agentPath = agent.folderPath;

  const [started, setStarted] = useState(false);
  const [missionSessionKey, setMissionSessionKey] = useState<string | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  useEmailSetupCleanup(agentPath);

  const sessionKeyForHooks = missionSessionKey ?? "";
  // This conversation's reactive state, straight from the SDK conversation VM.
  const vm = useConversationVm(agentPath, sessionKeyForHooks || null);
  const realFeed = vm?.feed;
  const isActive = vm?.running ?? false;

  const setupDone = useEmailSetupCompleted(realFeed);

  // The skip escape hatch exists ONLY for failure: a kickoff error or a turn
  // error in the feed. On the happy path the step auto-advances, so nothing
  // competes with the running conversation.
  const showSkip = shouldOfferSkip({
    hasError:
      error !== null || feedShowsTurnError((realFeed ?? []) as FeedItem[]),
    setupDone,
  });

  // Conversion + auto-advance to the success screen the moment it sends.
  const doneFired = useRef(false);
  useEffect(() => {
    if (setupDone && !doneFired.current) {
      doneFired.current = true;
      analytics.track("first_email_sent", { provider });
      onContinue();
    }
  }, [setupDone, provider, onContinue]);

  // Synchronous guard: `started` state alone leaves a same-frame window where a
  // rage click fires `createMission` twice and the agent sends two real emails.
  const startedRef = useRef(false);
  const handleSend = useCallback(async () => {
    if (startedRef.current) return;
    startedRef.current = true;
    setStarted(true);
    setError(null);
    // A failed setup write aborts the kickoff, so the inline error stays
    // visible on the card for retry rather than sending the agent blind.
    try {
      await prepareEmailMissionSetup({
        agentPath,
        emailToolkit,
        emailToolkitLabel,
      });
    } catch (e) {
      startedRef.current = false;
      setStarted(false);
      setError(e instanceof Error ? e.message : String(e));
      return;
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
        t("tutorial.missions.email.offer.option"),
        {
          title: emailToolkitLabel,
          providerOverride: provider,
          modelOverride: model,
          effortOverride: "medium",
          // Autopilot: the onboarding turn must SEND the email on the first
          // message, not pause on ask_user/request_connection questions.
          modeOverride: "auto",
        },
      );
      setMissionSessionKey(result.sessionKey);
      analytics.track("first_message_sent");
    } catch (e) {
      startedRef.current = false;
      setStarted(false);
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [agent, agentPath, emailToolkit, emailToolkitLabel, provider, model, t]);

  // Live composer (only used if the user wants to chat after the send).
  const sendNow = useCallback(
    async (text: string, _files: File[]) => {
      const trimmed = text.trim();
      if (!trimmed || !missionSessionKey) return;
      // The turn stream pushes the user bubble into the conversation VM
      // itself — no app-side optimistic push.
      try {
        await tauriChat.send(agentPath, trimmed, missionSessionKey, {
          providerOverride: provider,
          modelOverride: model,
          effortOverride: "medium",
          // Follow-ups stay in Autopilot too: the whole onboarding chat runs
          // without blocking questions.
          modeOverride: "auto",
          queuedPreview: { text: trimmed },
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [agentPath, missionSessionKey, provider, model],
  );

  const messageQueue = useSessionMessageQueue({
    agentPath,
    sessionKey: missionSessionKey,
    sendNow,
  });

  const handleComposerSend = useCallback(
    async (text: string, files: File[]) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      await messageQueue.sendOrQueue(trimmed, files);
    },
    [messageQueue],
  );

  const handleStop = useCallback(() => {
    if (!missionSessionKey) return;
    void tauriChat.stop(agentPath, missionSessionKey).catch((error) => {
      setError(error instanceof Error ? error.message : String(error));
    });
  }, [agentPath, missionSessionKey]);

  const isLoading = started && isActive;

  return {
    started,
    isLoading,
    error,
    feedItems: (realFeed ?? []) as FeedItem[],
    sessionKey: missionSessionKey ?? "setup-wizard",
    showSkip,
    onStop: started && isActive ? handleStop : undefined,
    handleSend,
    handleComposerSend,
    queuedMessages: messageQueue.queuedMessages,
    removeQueuedMessage: messageQueue.removeQueuedMessage,
  };
}
