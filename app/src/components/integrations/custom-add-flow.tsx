import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useStartCustomOAuth } from "../../hooks/queries";
import type { Agent } from "../../lib/types";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import { AgentPickerDialog } from "../agent-picker-dialog";
import { CustomAddDialog } from "./custom-add-dialog";

interface CustomAddFlowProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent?: Agent;
  transportAgentId?: string;
  onStartChat: (target: Agent) => void;
  onNeedsKey: (slug: string) => void;
}

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
              signIn.mutate(
                { slug: view.slug },
                {
                  onSuccess: ({ opened }) =>
                    addToast({
                      title: t(
                        opened
                          ? "custom.oauth.openedToast"
                          : "custom.oauth.blockedToast",
                        { name: view.name },
                      ),
                      variant: "info",
                    }),
                },
              );
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
