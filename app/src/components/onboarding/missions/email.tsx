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
import { EmailOfferAction } from "./email-offer-action";
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
  /** Leave onboarding when the mission errored (the only time skip shows). */
  onSkip: () => void;
}

/**
 * Final onboarding step: the agent sends one real email to the user themselves.
 * The email is already connected, so this starts with one explicit action. The
 * session lifecycle + auto-advance live in `useEmailMissionSession`; this
 * component only renders the chat surface.
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
  const { t } = useTranslation("setup");
  const [composerText, setComposerText] = useState("");
  const [composerFiles, setComposerFiles] = useState<File[]>([]);
  const [openLinkError, setOpenLinkError] = useState<string | null>(null);
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
    void tauriSystem.openUrl(url).catch((error) => {
      setOpenLinkError(error instanceof Error ? error.message : String(error));
    });
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
      onSpace
      eyebrow={eyebrow}
      title={t("tutorial.missions.email.title")}
      // The mission body lives in the offer card, so no subtitle duplicates it.
      // Back disappears once the mission runs: returning would start a second
      // session and a second real email. The skip exit below appears only if
      // the mission errors.
      onBack={session.started ? undefined : onBack}
      backLabel={t("tutorial.nav.back")}
    >
      {(session.error || openLinkError) && (
        <p className="mb-3 rounded-xl border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          {session.error ?? openLinkError}
        </p>
      )}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center gap-2 pb-3">
          <HoustonAvatar
            color={resolveAgentColor(assistantColor)}
            diameter={24}
            running={session.isLoading}
          />
          <span className="truncate text-xs font-medium text-ink-muted">
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
            placeholder={t("tutorial.missions.email.placeholder")}
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
            // Until the mission starts, the offer is the ONLY action: the
            // reply input stays hidden ("replace") so nothing competes with
            // the one button that kicks off the real email.
            composerOverrideMode="replace"
            composerOverride={
              session.started ? undefined : (
                <EmailOfferAction
                  description={t("tutorial.missions.email.body")}
                  label={t("tutorial.missions.email.offer.option")}
                  onStart={() => void session.handleSend()}
                />
              )
            }
          />
        </div>
        {session.showSkip && (
          <div className="flex shrink-0 items-center justify-between gap-3 pt-3">
            <p className="min-w-0 text-xs text-ink-muted">
              {t("tutorial.missions.email.skipHint")}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="shrink-0"
              onClick={onSkip}
            >
              {t("tutorial.missions.email.skip")}
            </Button>
          </div>
        )}
      </div>
    </SetupCard>
  );
}
