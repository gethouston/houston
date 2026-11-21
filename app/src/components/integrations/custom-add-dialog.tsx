import type { CustomIntegrationView } from "@houston/engine-adapter";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@houston-ai/core";
import { MessageCircle, Wrench } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChoiceCard } from "./choice-card";
import { CustomAddForm } from "./custom-add-form";

export function CustomAddDialog({
  open,
  onOpenChange,
  agentId,
  onStartChat,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentId?: string;
  onStartChat: () => void;
  onAdded: (view: CustomIntegrationView) => void;
}) {
  const { t } = useTranslation("integrations");
  const [step, setStep] = useState<"choose" | "form">("choose");
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setStep("choose");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
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
