import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Agent } from "../../lib/types";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import { AgentPickerDialog } from "../agent-picker-dialog";
import { CustomAddDialog } from "./custom-add-dialog";

interface CustomAddFlowProps {
  /** The add fork dialog's open state — the parent's Add button drives it. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Per-agent surface (HOU-823): the chat starts with THIS agent (no picker)
   *  and the manual form rides its routes. Absent on the global page, where
   *  the chat path goes through the agent picker first. */
  agent?: Agent;
  /** Start the guided setup chat with the resolved agent. */
  onStartChat: (target: Agent) => void;
  /** A manual add that needs a key landed `pending`: chain into the secure
   *  key dialog for this slug (the parent owns the dialog trio). */
  onNeedsKey: (slug: string) => void;
}

/**
 * The "Add custom integration" entry point's dialog pair: the
 * {@link CustomAddDialog} fork (guided chat vs. manual form) and, on the
 * global page's chat path, the {@link AgentPickerDialog} it chains into.
 * Owns only that chaining — every outcome hands back to the parent
 * (`onStartChat` / `onNeedsKey`), which owns the chat and the key dialog.
 */
export function CustomAddFlow({
  open,
  onOpenChange,
  agent,
  onStartChat,
  onNeedsKey,
}: CustomAddFlowProps) {
  const { t } = useTranslation("integrations");
  const agents = useAgentStore((s) => s.agents);
  const addToast = useUIStore((s) => s.addToast);
  const [pickerOpen, setPickerOpen] = useState(false);

  const startChat = (target: Agent) => {
    onOpenChange(false);
    setPickerOpen(false);
    onStartChat(target);
  };

  return (
    <>
      <CustomAddDialog
        open={open}
        onOpenChange={onOpenChange}
        agentId={agent?.id}
        onStartChat={() => {
          if (agent) startChat(agent);
          else {
            onOpenChange(false);
            setPickerOpen(true);
          }
        }}
        onAdded={(view) => {
          onOpenChange(false);
          if (view.state.status === "pending") onNeedsKey(view.slug);
          else
            addToast({
              title: t("custom.add.addedToast", { name: view.name }),
              variant: "success",
            });
        }}
      />

      <AgentPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        agents={agents}
        onPick={startChat}
      />
    </>
  );
}
