import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Input } from "@houston-ai/core";

import { OptionCard } from "../setup-card";

/**
 * The guided cards that replace the chat composer during the faked first-email
 * flow. Each collects one choice and hands it back; the orchestrator fakes the
 * "message + thinking" beats between them and only spins up the real agent once
 * the provider is picked. App-layer components, so they use `t()` directly.
 */

const textareaCls =
  "min-h-[64px] w-full resize-none rounded-xl border border-black/10 bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-foreground";

/** Step 0: the single "Send an email" call to action. */
export function OfferCard({ onSend }: { onSend: () => void }) {
  const { t } = useTranslation("setup");
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-black/10 bg-secondary p-4">
      <p className="text-sm text-muted-foreground">
        {t("tutorial.missions.email.offer.prompt")}
      </p>
      <Button className="h-10 w-full rounded-full" onClick={onSend}>
        {t("tutorial.missions.email.offer.cta")}
      </Button>
    </div>
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
    <div className="flex flex-col gap-2">
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
        <div className="flex flex-col gap-2">
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
        </div>
      )}
      <Button
        className="h-10 w-full rounded-full"
        disabled={!valid}
        onClick={() =>
          onConfirm({
            toMyself: mode === "self",
            email: email.trim(),
            message: message.trim(),
          })
        }
      >
        {t("tutorial.missions.email.recipient.confirm")}
      </Button>
    </div>
  );
}

export interface ProviderChoice {
  toolkit: string;
  label: string;
}

/** Step 2: pick the email provider; Gmail/Outlook send straight away. */
export function ProviderCard({
  onConfirm,
}: {
  onConfirm: (choice: ProviderChoice) => void;
}) {
  const { t } = useTranslation("setup");
  const [other, setOther] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-2">
      <OptionCard
        label="Gmail"
        selected={false}
        onSelect={() => onConfirm({ toolkit: "gmail", label: "Gmail" })}
      />
      <OptionCard
        label="Outlook"
        selected={false}
        onSelect={() => onConfirm({ toolkit: "outlook", label: "Outlook" })}
      />
      <OptionCard
        label={t("tutorial.missions.email.provider.other")}
        selected={other !== null}
        onSelect={() => setOther((v) => v ?? "")}
      />
      {other !== null && (
        <div className="flex flex-col gap-2">
          <Input
            autoFocus
            value={other}
            placeholder={t("tutorial.missions.email.provider.otherPlaceholder")}
            className="rounded-xl"
            onChange={(e) => setOther(e.target.value)}
          />
          <Button
            className="h-10 w-full rounded-full"
            disabled={!other.trim()}
            onClick={() =>
              onConfirm({
                toolkit: other.trim().toLowerCase(),
                label: other.trim(),
              })
            }
          >
            {t("tutorial.missions.email.provider.confirm")}
          </Button>
        </div>
      )}
    </div>
  );
}
