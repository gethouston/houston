import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@houston-ai/core";
import type { CustomIntegrationView } from "@houston-ai/engine-client";
import { MessageCircle, Wrench } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChoiceCard } from "./choice-card";
import { CustomAddForm } from "./custom-add-form";

/**
 * The "Add custom integration" dialog (HOU-980): a two-way fork, then the
 * chosen path. "Set up with your agent" hands off to the guided setup chat
 * (the parent resolves the agent — the ambient agent, the workspace's only
 * agent, or the picker — and starts it); "Add manually" swaps the body for
 * the typed form ({@link CustomAddForm}: kind, URL + detect, name,
 * needs-a-key). The chat path LEADS visually because the product's audience
 * is non-technical; the form exists for people who already hold the URL, and
 * it rides the per-agent detect/add routes so it works behind the gateway.
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
  /** The transport agent (HOU-823): detect + add ride ITS routes — the only
   *  custom form a gateway-fronted deployment proxies to the pod. */
  agentId?: string;
  /** Close and start the guided setup chat (the parent resolves the agent). */
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
              emphasis="lead"
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
