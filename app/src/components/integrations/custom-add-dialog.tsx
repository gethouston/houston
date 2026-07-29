import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@houston-ai/core";
import type { CustomIntegrationView } from "@houston-ai/engine-client";
import { MessageCircle, Wrench } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { CustomAddForm } from "./custom-add-form";

function ChoiceCard({
  icon,
  title,
  description,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-start gap-3 rounded-xl border border-line px-4 py-3 text-left transition-colors hover:bg-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
    >
      <span className="mt-0.5 text-ink-muted">{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">{title}</span>
        <span className="mt-0.5 block text-[13px] text-ink-muted">
          {description}
        </span>
      </span>
    </button>
  );
}

/**
 * The "Add custom integration" dialog (HOU-980): a two-way fork, then the
 * chosen path. "With Houston's help" hands off to the guided setup chat (the
 * parent starts it — with THIS agent on the per-agent tab, via the agent
 * picker on the global page); "Add it manually" swaps the body for the typed
 * form ({@link CustomAddForm}: kind, URL + detect, name, needs-a-key). The
 * chat path leads because the product's audience is non-technical; the form
 * exists for people who already hold the URL.
 */
export function CustomAddDialog({
  open,
  onOpenChange,
  agentId,
  onStartChat,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Per-agent surface (HOU-823): detect + add ride the agent's routes. */
  agentId?: string;
  /** Close and start the guided setup chat (picker first on the global page). */
  onStartChat: () => void;
  /** A definition landed: the parent closes, toasts, and opens the key dialog
   *  when the new integration still waits on a credential. */
  onAdded: (view: CustomIntegrationView) => void;
}) {
  const { t } = useTranslation("integrations");
  const [step, setStep] = useState<"choose" | "form">("choose");
  // Every open starts back at the fork; the form remounts blank with it.
  // Adjust-during-render (not an effect) so a reopen can never paint one
  // stale frame of the previous step first.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setStep("choose");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("custom.add.title")}</DialogTitle>
          <DialogDescription>{t("custom.description")}</DialogDescription>
        </DialogHeader>
        {step === "choose" ? (
          <div className="flex flex-col gap-2">
            <ChoiceCard
              icon={<MessageCircle className="size-5" />}
              title={t("custom.add.chatTitle")}
              description={t("custom.add.chatDesc")}
              onClick={onStartChat}
            />
            <ChoiceCard
              icon={<Wrench className="size-5" />}
              title={t("custom.add.manualTitle")}
              description={t("custom.add.manualDesc")}
              onClick={() => setStep("form")}
            />
          </div>
        ) : (
          <CustomAddForm
            agentId={agentId}
            onBack={() => setStep("choose")}
            onAdded={onAdded}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
