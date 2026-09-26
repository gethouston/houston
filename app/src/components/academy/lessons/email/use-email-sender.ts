import { useMemo } from "react";
import { useSidebarLayoutValue } from "../../../../hooks/use-sidebar-layout";
import {
  type EmailSenderChoice,
  emailSenderChoice,
} from "../../../../lib/academy/email-lesson/email-sender";
import { flatSidebarOrder } from "../../../../lib/agent-order";
import { useAgentStore } from "../../../../stores/agents";
import { useUIStore } from "../../../../stores/ui";
import { useWorkspaceStore } from "../../../../stores/workspaces";
import { useEmailLessonStore } from "./email-lesson-store";

/** Every AI Employee, in sidebar order, and the one that sends, live. */
export function useEmailSender(): EmailSenderChoice {
  const agents = useAgentStore((s) => s.agents);
  const workspaceId = useWorkspaceStore((s) => s.current?.id);
  const layout = useSidebarLayoutValue(workspaceId);
  const ordered = useMemo(
    () => flatSidebarOrder(agents, layout),
    [agents, layout],
  );
  const activeAgentId = useUIStore((s) => s.activeAgentId);
  const pickedAgentId = useEmailLessonStore((s) => s.pickedAgentId);
  return emailSenderChoice({ agents: ordered, activeAgentId, pickedAgentId });
}
