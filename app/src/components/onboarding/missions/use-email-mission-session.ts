import type { FeedItem, QueuedChatMessage } from "@houston-ai/chat";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSessionMessageQueue } from "../../../hooks/use-session-message-queue";
import { analytics } from "../../../lib/analytics";
import { createMission } from "../../../lib/create-mission";
import { logger } from "../../../lib/logger";
import { tauriAgent, tauriChat } from "../../../lib/tauri";
import type { Agent } from "../../../lib/types";
import { useFeedStore } from "../../../stores/feeds";
import {
  isActiveSessionStatus,
  useSessionStatus,
} from "../../../stores/session-status";
import {
  appendSetupSection,
  stripSetupSection,
} from "../tutorial-system-prompt";
import { shouldOfferSkip } from "./email-skip";

/** The agent emits this once the email actually sent. */
const SETUP_END_RE = /\[\s*\\?TUTORIAL[_\s\\]+COMPLETED?\s*\]/i;

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
  /** HOU-555 escape hatch: the agent ran, went idle, never confirmed. */
  showSkip: boolean;
  onStop: (() => void) | undefined;
  handleSend: () => Promise<void>;
  handleComposerSend: (text: string, files: File[]) => Promise<void>;
  queuedMessages: QueuedChatMessage[];
  removeQueuedMessage: (id: string) => void;
}

/**
 * Owns the final onboarding step's session lifecycle: kicking off the agent
 * (append the setup directive to CLAUDE.md, then `createMission`), tracking the
 * feed for the `[TUTORIAL_COMPLETE]` marker to auto-advance, the live composer
 * queue, and stripping the directive on unmount. Presentation-free so the
 * `EmailMission` component stays under the file cap and purely renders.
 */
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
  const realFeed = useFeedStore(
    (s) => s.items[agentPath]?.[sessionKeyForHooks],
  );
  const pushFeedItem = useFeedStore((s) => s.pushFeedItem);
  const sessionStatus = useSessionStatus(agentPath, sessionKeyForHooks);
  const isActive = isActiveSessionStatus(sessionStatus);

  // The mission session has gone active at least once (the agent actually ran).
  // Gates the skip escape hatch so we only offer it after a real attempt.
  const [hasRun, setHasRun] = useState(false);
  useEffect(() => {
    if (isActive) setHasRun(true);
  }, [isActive]);

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

  // Offer the skip escape hatch only when the agent ran, went idle, and never
  // emitted the completion marker — the "stuck" state from HOU-555.
  const showSkip = shouldOfferSkip({ hasRun, isActive, setupDone });

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
    // Pre-feed the agent (send to self via the already-connected toolkit). The
    // directive IS the mission (which toolkit, send to self, the completion
    // marker) — starting without it would run the agent blind and strand the
    // user on the skip hatch, so a failed write aborts the kickoff instead of
    // logging and continuing. The engine call already toasted the real error
    // via `call()`; the inline error keeps it visible on the card for retry.
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
      startedRef.current = false;
      setStarted(false);
      setError(e instanceof Error ? e.message : String(e));
      return;
    }
    analytics.track("first_message_sent");
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
        },
      );
      setMissionSessionKey(result.sessionKey);
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
      await messageQueue.sendOrQueue(trimmed, files);
    },
    [messageQueue],
  );

  const handleStop = useCallback(() => {
    if (!missionSessionKey) return;
    // A stop failure surfaces via `call()` (toast + report); swallow the
    // re-throw so the handler never leaks an unhandled rejection.
    tauriChat.stop(agentPath, missionSessionKey).catch(() => {});
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
