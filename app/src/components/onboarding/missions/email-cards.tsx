import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ArrowUp, Loader2 } from "lucide-react";
import { Input } from "@houston-ai/core";

import { OptionCard } from "../setup-card";

/**
 * The guided cards that replace the chat composer during the faked first-email
 * flow. Each is shaped like the chat input itself — the same rounded card and
 * the same round send button — so the wizard reads as part of the conversation.
 * App-layer components, so they use `t()` directly.
 */

const textareaCls =
  "min-h-[60px] w-full resize-none rounded-xl border border-black/10 bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-foreground";

/** The chat composer's send button, replicated exactly (see chat-input). */
function SendButton({
  disabled,
  loading,
  onClick,
}: {
  disabled?: boolean;
  loading?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
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

/** The chat-input shell: a rounded card with the options/content and a trailing
 *  send button — identical surface to the real composer. */
function WizardCard({
  children,
  onSend,
  sendDisabled,
  sendLoading,
}: {
  children: ReactNode;
  onSend: () => void;
  sendDisabled?: boolean;
  sendLoading?: boolean;
}) {
  return (
    <div className="rounded-[28px] border border-border/50 bg-card p-2.5 shadow-[0_1px_6px_rgba(0,0,0,0.06)]">
      <div className="flex flex-col gap-1.5 px-1 pb-1.5 pt-0.5">{children}</div>
      <div className="flex justify-end">
        <SendButton
          disabled={sendDisabled}
          loading={sendLoading}
          onClick={onSend}
        />
      </div>
    </div>
  );
}

/** Step 0: one preselected option ("Send an email on my behalf"), so the user
 *  just presses send. Same shape as the later steps. */
export function OfferCard({ onSend }: { onSend: () => void }) {
  const { t } = useTranslation("setup");
  return (
    <WizardCard onSend={onSend}>
      <OptionCard
        label={t("tutorial.missions.email.offer.option")}
        selected
      />
    </WizardCard>
  );
}

export interface RecipientChoice {
  toMyself: boolean;
  email: string;
  message: string;
}

/** Step 1: send to myself (test) vs someone else (with address + message). */
export function RecipientCard({
  onConfirm,
}: {
  onConfirm: (choice: RecipientChoice) => void;
}) {
  const { t } = useTranslation("setup");
  const [mode, setMode] = useState<"self" | "other" | null>(null);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  const valid =
    mode === "self" || (mode === "other" && email.trim().includes("@"));

  return (
    <WizardCard
      sendDisabled={!valid}
      onSend={() =>
        onConfirm({
          toMyself: mode === "self",
          email: email.trim(),
          message: message.trim(),
        })
      }
    >
      <OptionCard
        label={t("tutorial.missions.email.recipient.self")}
        selected={mode === "self"}
        onSelect={() => setMode("self")}
      />
      <OptionCard
        label={t("tutorial.missions.email.recipient.other")}
        selected={mode === "other"}
        onSelect={() => setMode("other")}
      />
      {mode === "other" && (
        <>
          <Input
            type="email"
            autoFocus
            value={email}
            placeholder={t("tutorial.missions.email.recipient.emailPlaceholder")}
            className="rounded-xl"
            onChange={(e) => setEmail(e.target.value)}
          />
          <textarea
            value={message}
            placeholder={t(
              "tutorial.missions.email.recipient.messagePlaceholder",
            )}
            className={textareaCls}
            onChange={(e) => setMessage(e.target.value)}
          />
        </>
      )}
    </WizardCard>
  );
}

export interface ProviderChoice {
  toolkit: string;
  label: string;
}

/** Step 2: pick the email provider (select, then send to confirm). */
export function ProviderCard({
  onConfirm,
}: {
  onConfirm: (choice: ProviderChoice) => void;
}) {
  const { t } = useTranslation("setup");
  const [sel, setSel] = useState<"gmail" | "outlook" | "other" | null>(null);
  const [other, setOther] = useState("");

  const choice: ProviderChoice | null =
    sel === "gmail"
      ? { toolkit: "gmail", label: "Gmail" }
      : sel === "outlook"
        ? { toolkit: "outlook", label: "Outlook" }
        : sel === "other" && other.trim()
          ? { toolkit: other.trim().toLowerCase(), label: other.trim() }
          : null;

  return (
    <WizardCard
      sendDisabled={!choice}
      onSend={() => choice && onConfirm(choice)}
    >
      <OptionCard
        label="Gmail"
        selected={sel === "gmail"}
        onSelect={() => setSel("gmail")}
      />
      <OptionCard
        label="Outlook"
        selected={sel === "outlook"}
        onSelect={() => setSel("outlook")}
      />
      <OptionCard
        label={t("tutorial.missions.email.provider.other")}
        selected={sel === "other"}
        onSelect={() => setSel("other")}
      />
      {sel === "other" && (
        <Input
          autoFocus
          value={other}
          placeholder={t("tutorial.missions.email.provider.otherPlaceholder")}
          className="rounded-xl"
          onChange={(e) => setOther(e.target.value)}
        />
      )}
    </WizardCard>
  );
}

/** Step 3: connect the chosen email (real OAuth, but presented as a card in the
 *  scripted flow — the agent never has to connect it live). */
export function ConnectCard({
  label,
  connecting,
  onConnect,
}: {
  label: string;
  connecting: boolean;
  onConnect: () => void;
}) {
  const { t } = useTranslation("setup");
  return (
    <WizardCard sendLoading={connecting} onSend={onConnect}>
      <p className="px-1 text-sm text-muted-foreground">
        {connecting
          ? t("tutorial.missions.email.connect.waiting", { provider: label })
          : t("tutorial.missions.email.connect.prompt", { provider: label })}
      </p>
    </WizardCard>
  );
}
