import type { LessonPanelId } from "../../../lib/academy/lesson-spec";
import { EmailConnectPanel } from "./email/email-connect-panel";
import { EmailSenderPanel } from "./email/email-sender-panel";

export interface LessonPanelCopy {
  title: string;
  body: string;
  cta?: string;
}

export interface LessonPanelProps {
  copy: LessonPanelCopy;
  onNext: () => void;
  onExit: () => void;
}

export function LessonPanel({
  panel,
  ...props
}: LessonPanelProps & { panel: LessonPanelId }) {
  switch (panel) {
    case "emailConnect":
      return <EmailConnectPanel {...props} />;
    case "emailSender":
      return <EmailSenderPanel {...props} />;
  }
}
