import type { LessonPanelId } from "../../../lib/academy/lesson-spec";
import { EmailConnectPanel } from "./email/email-connect-panel";
import { EmailSenderPanel } from "./email/email-sender-panel";

/** A panel beat's own words, already translated. */
export interface LessonPanelCopy {
  title: string;
  body: string;
  cta?: string;
}

/** What every panel is handed: its words, the way on, and the way out. */
export interface LessonPanelProps {
  copy: LessonPanelCopy;
  /** Moves the lesson on (or finishes it, on the last beat). */
  onNext: () => void;
  /** Leaves the lesson, unfinished. */
  onExit: () => void;
}

/**
 * The one place a spec's `panel` id becomes a component, so a spec stays plain
 * data and the runner stays content-agnostic: it docks whatever this returns.
 */
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
