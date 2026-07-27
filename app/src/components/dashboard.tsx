import {
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@houston-ai/core";
import { Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useCanCreateAgents } from "../hooks/use-can-create-agents";
import { useCapabilities } from "../hooks/use-capabilities";
import { isMultiplayer } from "../lib/org-roles";
import { useAgentStore } from "../stores/agents";
import { useUIStore } from "../stores/ui";
import { MentionsInbox, useMentionInbox } from "./board/mentions-inbox";
import { MissionControlActive } from "./board/mission-control-active";
import { MissionControlArchived } from "./board/mission-control-archived";

/**
 * Which Mission Control surface is showing. A union rather than a pile of
 * booleans: the three are mutually exclusive by construction, and "archived AND
 * mentions" must never be representable.
 */
type MissionControlMode = "active" | "archived" | "mentions";

/**
 * Mission Control: every agent's missions on one board. The active board, the
 * cross-agent Archived view and the Mentions inbox are separate components that
 * swap (not hide) so only the mounted one's hooks run. This view owns the mode
 * + the no-agents empty state; all board wiring lives in `<MissionBoard>`.
 */
export function Dashboard() {
  const { t } = useTranslation("dashboard");
  const agents = useAgentStore((s) => s.agents);
  const setDialogOpen = useUIStore((s) => s.setCreateAgentDialogOpen);
  const { canCreate: canCreateAgents } = useCanCreateAgents();
  const { capabilities } = useCapabilities();
  const [mode, setMode] = useState<MissionControlMode>("active");
  // Mentions are a team surface: with nobody to mention you, the inbox is dead
  // chrome. Single player never sees the control and can never land in the mode.
  const mentionsEnabled = isMultiplayer(capabilities);
  const { mentionCount } = useMentionInbox(agents);
  const activeMode = mode === "mentions" && !mentionsEnabled ? "active" : mode;

  if (agents.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <Empty className="border-0">
          <EmptyHeader>
            <EmptyTitle>{t("noAgents.title")}</EmptyTitle>
            <EmptyDescription>{t("noAgents.description")}</EmptyDescription>
          </EmptyHeader>
          {canCreateAgents && (
            <Button
              className="mt-4 rounded-full"
              onClick={() => setDialogOpen(true)}
            >
              <Plus className="h-4 w-4" />
              {t("noAgents.cta")}
            </Button>
          )}
        </Empty>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {activeMode === "archived" ? (
        <MissionControlArchived
          agents={agents}
          onShowActive={() => setMode("active")}
        />
      ) : activeMode === "mentions" ? (
        <MentionsInbox agents={agents} onShowActive={() => setMode("active")} />
      ) : (
        <MissionControlActive
          agents={agents}
          onShowArchived={() => setMode("archived")}
          mentions={
            mentionsEnabled
              ? { onShow: () => setMode("mentions"), count: mentionCount }
              : undefined
          }
        />
      )}
    </div>
  );
}
