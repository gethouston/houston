import { useTeams } from "../../../../hooks/use-teams";
import {
  type EmailSenderChoice,
  emailSenderChoice,
} from "../../../../lib/academy/email-lesson/email-sender";
import { useUIStore } from "../../../../stores/ui";
import { useEmailLessonStore } from "./email-lesson-store";

/** The current team's AI Employees and the one that sends, live. */
export function useEmailSender(): EmailSenderChoice {
  const teams = useTeams();
  const activeTeamId = useUIStore((s) => s.activeTeamId);
  const pickedAgentId = useEmailLessonStore((s) => s.pickedAgentId);
  return emailSenderChoice({ teams, activeTeamId, pickedAgentId });
}
