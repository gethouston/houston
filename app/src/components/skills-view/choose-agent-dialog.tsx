import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  HoustonAvatar,
  resolveAgentColor,
} from "@houston-ai/core";
import type { Agent } from "../../lib/types";

/**
 * The single pick before a new skill starts on the workspace library: a skill
 * is built ON one AI Employee (the guided chat runs there, a GitHub import
 * installs there), so a workspace with several asks which one. A one-employee
 * workspace never sees this, and an employee's own Skills section never does
 * either — it already stands on the answer.
 *
 * The copy is the CALLER's, because the two ways in ask different questions.
 */
export function ChooseAgentDialog({
  open,
  onOpenChange,
  agents,
  title,
  description,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agents: Agent[];
  title: string;
  description: string;
  onPick: (agent: Agent) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="min-w-0">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
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
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
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
