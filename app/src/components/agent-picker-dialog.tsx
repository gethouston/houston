import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  HoustonAvatar,
  resolveAgentColor,
} from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import type { Agent } from "../lib/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agents: Agent[];
  onPick: (agent: Agent) => void;
  title?: string;
  description?: string;
}

export function AgentPickerDialog({
  open,
  onOpenChange,
  agents,
  onPick,
  title,
  description,
}: Props) {
  const { t } = useTranslation("dashboard");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl h-[80dvh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="shrink-0 px-6 pt-6 pb-3">
          <DialogTitle>{title ?? t("agentPicker.title")}</DialogTitle>
          <DialogDescription>
            {description ?? t("agentPicker.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-6">
          <div className="flex flex-col gap-2">
            {agents.map((a) => {
              const color = resolveAgentColor(a.color);
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => {
                    onPick(a);
                    onOpenChange(false);
                  }}
                  className="flex items-center gap-4 rounded-2xl bg-chip p-4 text-left transition-colors duration-200 hover:bg-hover w-full"
                >
                  <HoustonAvatar color={color} diameter={48} />
                  <span className="text-sm font-semibold text-ink">
                    {a.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
