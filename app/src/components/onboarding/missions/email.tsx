import { ChatPanel } from "@houston-ai/chat";
import { Button, HoustonAvatar, resolveAgentColor } from "@houston-ai/core";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFileToolRenderer } from "../../../hooks/use-file-tool-renderer";
import { tauriSystem } from "../../../lib/tauri";
import type { Agent } from "../../../lib/types";
import { useChatDisplayLabels } from "../../use-chat-display-labels";
import { useQueuedMessageLabels } from "../../use-queued-message-labels";
import { SetupCard } from "../setup-card";
import { OfferCard } from "./email-cards";
import { useEmailMissionSession } from "./use-email-mission-session";

/** Strip the completion marker (with optional surrounding bold) from a reply. */
const SETUP_END_RE = /\[\s*\\?TUTORIAL[_\s\\]+COMPLETED?\s*\]/i;
const SETUP_END_STRIP_RE =
  /\*{0,2}\[\s*\\?TUTORIAL[_\s\\]+COMPLETED?\s*\]\*{0,2}/gi;

interface EmailMissionProps {
  eyebrow: string;
  agent: Agent;
  assistantColor: string;
  provider: string;
  model: string;
  emailToolkit: string;
  emailToolkitLabel: string;
  onBack: () => void;
  /** Advance to the success screen once the email is sent. */
  onContinue: () => void;
  /** Escape hatch: leave onboarding and go straight into the app. Shown only
   *  once the agent ran but never confirmed completion (HOU-555). */
  onSkip: () => void;
}

/**
 * Final onboarding step: the agent sends one real email to the user themselves.
 * The email is already connected (previous step), so this is just a single
 * "Send an email to myself" card; the agent reads the directive from CLAUDE.md
 * and sends. The session lifecycle + auto-advance live in
 * `useEmailMissionSession`; this component only renders the chat surface.
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
  onSkip,
}: EmailMissionProps) {
  const { t } = useTranslation(["setup", "chat"]);
  const [composerText, setComposerText] = useState("");
  const [composerFiles, setComposerFiles] = useState<File[]>([]);

  // The same chat-rendering hooks the real agent chat uses, so the onboarding
  // chat shows the agent's actual tool calls/results + the proper in-flight
  // indicator, not just a bare "thinking".
  const { processLabels, getThinkingMessage, thinkingIndicator } =
    useChatDisplayLabels();
  const { isSpecialTool, renderToolResult, renderTurnSummary } =
    useFileToolRenderer(agent.folderPath);
  const queuedLabels = useQueuedMessageLabels();

  const session = useEmailMissionSession({
    agent,
    provider,
    model,
    emailToolkit,
    emailToolkitLabel,
    onContinue,
  });

  const handleComposerSend = useCallback(
    async (text: string, files: File[]) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      setComposerText("");
      setComposerFiles([]);
      await session.handleComposerSend(trimmed, files);
    },
    [session],
  );

  const handleOpenLink = useCallback((url: string) => {
    // A failed open surfaces via `call()`; swallow the re-throw here.
    tauriSystem.openUrl(url).catch(() => {});
  }, []);

  const transformContent = useCallback(
    (content: string) => ({
      content: SETUP_END_RE.test(content)
        ? content.replace(SETUP_END_STRIP_RE, "").trim()
        : content,
    }),
    [],
  );

  return (
    <SetupCard
      eyebrow={eyebrow}
      title={t("setup:tutorial.missions.email.title")}
      subtitle={
        session.started ? undefined : t("setup:tutorial.missions.email.body")
      }
      // Back disappears once the mission is running: leaving mid-turn drops the
      // completion-marker listener while the agent still sends, and returning
      // would kick off a SECOND session (and a second real email). The HOU-555
      // skip hatch is the exit for a stuck run.
      onBack={session.started ? undefined : onBack}
      backLabel={t("setup:tutorial.nav.back")}
    >
      {session.error && (
        <p className="mb-3 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {session.error}
        </p>
      )}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center gap-2 pb-3">
          <HoustonAvatar
            color={resolveAgentColor(assistantColor)}
            diameter={24}
            running={session.isLoading}
          />
          <span className="truncate text-xs font-medium text-muted-foreground">
            {agent.name}
          </span>
        </div>
        <div className="flex min-h-0 flex-1 flex-col">
          <ChatPanel
            sessionKey={session.sessionKey}
            feedItems={session.feedItems}
            onSend={handleComposerSend}
            onStop={session.onStop}
            isLoading={session.isLoading}
            placeholder={t("setup:tutorial.missions.email.placeholder")}
            processLabels={processLabels}
            getThinkingMessage={getThinkingMessage}
            thinkingIndicator={thinkingIndicator}
            isSpecialTool={isSpecialTool}
            renderToolResult={renderToolResult}
            renderTurnSummary={renderTurnSummary}
            onOpenLink={handleOpenLink}
            transformContent={transformContent}
            value={composerText}
            onValueChange={setComposerText}
            attachments={composerFiles}
            onAttachmentsChange={setComposerFiles}
            queuedMessages={session.queuedMessages}
            onRemoveQueuedMessage={session.removeQueuedMessage}
            queuedLabels={queuedLabels}
            composerOverride={
              session.started ? undefined : (
                <OfferCard onSend={session.handleSend} />
              )
            }
          />
        </div>
        {session.showSkip && (
          <div className="flex shrink-0 items-center justify-between gap-3 pt-3">
            <p className="min-w-0 text-xs text-muted-foreground">
              {t("setup:tutorial.missions.email.skipHint")}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="shrink-0"
              onClick={onSkip}
            >
              {t("setup:tutorial.missions.email.skip")}
            </Button>
          </div>
        )}
      </div>
    </SetupCard>
  );
}
