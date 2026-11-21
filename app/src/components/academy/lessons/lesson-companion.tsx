import type { LessonCompanionId } from "../../../lib/academy/lesson-spec";
import { EmailAskCompanion } from "./email/email-ask";
import { EmailWatchCompanion } from "./email/email-watch";

export interface LessonCompanionProps {
  onNext: () => void;
  onReady: () => void;
}

export function LessonCompanion({
  companion,
  ...props
}: LessonCompanionProps & { companion: LessonCompanionId }) {
  switch (companion) {
    case "emailAsk":
      return <EmailAskCompanion {...props} />;
    case "emailWatch":
      return <EmailWatchCompanion {...props} />;
  }
}
