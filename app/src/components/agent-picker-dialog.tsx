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
  /** Override the heading for a caller that is not starting a mission (a
   *  team's Routines asks the same question about a routine). Defaults to the
   *  mission wording, so the board is unchanged. */
  title?: string;
  description?: string;
}

/**
 * Modal that asks "which agent should run this?" and renders one card per
 * agent. It is the ONE answer to that question wherever a create starts from a
 * surface that spans several agents — but it only ASKS: what picking an agent
 * leads to belongs entirely to the caller, and differs by caller.
 *
 * - A team's Mission Control "New mission" switches to that agent's board view
 *   and opens the new-mission right panel, the same flow the per-agent New
 *   Mission button gives. That sequencing lives in the board's own wiring,
 *   because it depends on view-mode state.
 * - A team's Routines opens that agent's routine intake in the shared shell
 *   panel; nothing navigates.
 *
 * So the copy is the caller's too: pass `title` / `description` whenever "a
 * fresh conversation" is not what happens next. The defaults are the mission
 * wording, so the board is unchanged.
 */
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
      <DialogContent className="sm:max-w-xl h-[80vh] flex flex-col gap-0 p-0 overflow-hidden">
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
