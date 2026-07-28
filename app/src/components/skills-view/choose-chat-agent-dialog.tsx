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
import type { Agent } from "../../lib/types";

/**
 * "Who should build it with you?" — the single pick before the global page's
 * create-with-AI chat (HOU-792). The guided chat runs ON one agent (the
 * skill is created there first, then assignable from the manage dialog), so
 * a workspace with several agents chooses the builder here. A one-agent
 * workspace never sees this — the page skips straight to the chat.
 */
export function ChooseChatAgentDialog({
  open,
  onOpenChange,
  agents,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agents: Agent[];
  onPick: (agent: Agent) => void;
}) {
  const { t } = useTranslation("skills");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="min-w-0">
          <DialogTitle>{t("global.chatPick.title")}</DialogTitle>
          <DialogDescription>
            {t("global.chatPick.description")}
          </DialogDescription>
        </DialogHeader>
        <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto pr-1">
          {agents.map((agent) => (
            <li key={agent.id}>
              <button
                type="button"
                onClick={() => {
                  onPick(agent);
                  onOpenChange(false);
                }}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-hover"
              >
                <HoustonAvatar
                  color={resolveAgentColor(agent.color)}
                  diameter={28}
                />
                <span className="min-w-0 flex-1 truncate text-sm text-ink">
                  {agent.name}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
