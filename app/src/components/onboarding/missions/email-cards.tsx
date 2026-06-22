import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ArrowUp, Loader2 } from "lucide-react";

import { OptionCard } from "../setup-card";

/**
 * The "Send an email to myself" card that replaces the chat composer in the
 * final onboarding step. Shaped like the chat input — the same rounded card and
 * round send button — so it reads as part of the conversation.
 */

/** The chat composer's send button, replicated exactly (see chat-input). */
function SendButton({
  loading,
  onClick,
}: {
  loading?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={loading}
      onClick={onClick}
      className="flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-30"
    >
      {loading ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <ArrowUp className="size-4" />
      )}
    </button>
  );
}

/** The chat-input shell: a rounded card with content and a trailing send button. */
function WizardCard({
  children,
  onSend,
  sendLoading,
}: {
  children: ReactNode;
  onSend: () => void;
  sendLoading?: boolean;
}) {
  return (
    <div className="rounded-[28px] border border-border/50 bg-card p-2.5 shadow-[0_1px_6px_rgba(0,0,0,0.06)]">
      <div className="flex flex-col gap-1.5 px-1 pb-1.5 pt-0.5">{children}</div>
      <div className="flex justify-end">
        <SendButton loading={sendLoading} onClick={onSend} />
      </div>
    </div>
  );
}

/** One preselected option ("Send an email to myself"); the user just hits send. */
export function OfferCard({
  onSend,
  sending,
}: {
  onSend: () => void;
  sending?: boolean;
}) {
  const { t } = useTranslation("setup");
  return (
    <WizardCard onSend={onSend} sendLoading={sending}>
      <OptionCard label={t("tutorial.missions.email.offer.option")} selected />
    </WizardCard>
  );
}
