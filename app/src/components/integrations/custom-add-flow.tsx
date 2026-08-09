import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useStartCustomOAuth } from "../../hooks/queries";
import type { Agent } from "../../lib/types";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import { AgentPickerDialog } from "../agent-picker-dialog";
import { CustomAddDialog } from "./custom-add-dialog";

interface CustomAddFlowProps {
  /** The add fork dialog's open state — the parent's Add button drives it. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The AMBIENT agent (an agent-scoped caller): the guided chat starts with THIS
   *  agent, no picker. Absent on the global page, where the workspace's only
   *  agent resolves the target and only a multi-agent workspace asks. */
  agent?: Agent;
  /** The per-agent transport for the manual form's detect/add (HOU-823) — the
   *  ONE route family the hosted gateway proxies to the pod. Resolved by
   *  `useCustomTransportAgentId`, so it is set on the global page too. */
  transportAgentId?: string;
  /** Start the guided setup chat with the resolved agent. */
  onStartChat: (target: Agent) => void;
  /** A manual add that needs a key landed `pending`: chain into the secure
   *  key dialog for this slug (the parent owns the dialog trio). */
  onNeedsKey: (slug: string) => void;
}

/**
 * The "Add custom integration" entry point's dialog pair: the
 * {@link CustomAddDialog} fork (guided chat vs. manual form) and, when the
 * chat path cannot name its agent by itself, the {@link AgentPickerDialog} it
 * chains into. Owns only that chaining — every outcome hands back to the
 * parent (`onStartChat` / `onNeedsKey`), which owns the chat and the key
 * dialog.
 */
export function CustomAddFlow({
  open,
  onOpenChange,
  agent,
  transportAgentId,
  onStartChat,
  onNeedsKey,
}: CustomAddFlowProps) {
  const { t } = useTranslation("integrations");
  const agents = useAgentStore((s) => s.agents);
  const addToast = useUIStore((s) => s.addToast);
  const signIn = useStartCustomOAuth(transportAgentId);
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
        agentId={transportAgentId}
        onStartChat={() => {
          // The ambient agent, else the workspace's only
          // agent. Only a genuinely ambiguous workspace gets the picker:
          // asking "which agent?" when there is exactly one is a dead
          // question the #1171 flow already stopped asking.
          const target = agent ?? (agents.length === 1 ? agents[0] : undefined);
          if (target) startChat(target);
          else {
            onOpenChange(false);
            setPickerOpen(true);
          }
        }}
        onAdded={(view) => {
          onOpenChange(false);
          if (view.state.status === "pending") {
            if (view.auth === "oauth") {
              // Chain straight into the browser sign-in (PRODUCT-1172); the
              // row flips to active on the CustomIntegrationsChanged event.
              signIn.mutate(view.slug);
              addToast({
                title: t("custom.oauth.openedToast", { name: view.name }),
                variant: "info",
              });
            } else onNeedsKey(view.slug);
          } else
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
