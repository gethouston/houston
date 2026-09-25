import type { LessonCompanionId } from "../../../lib/academy/lesson-spec";
import { EmailAskCompanion } from "./email/email-ask";
import { EmailWatchCompanion } from "./email/email-watch";

/** What every companion is handed: the way on, for one that ends its beat. */
export interface LessonCompanionProps {
  /** Moves the lesson on (or finishes it, on the last beat). */
  onNext: () => void;
  /** Arms a beat that waits on its companion (`advanceOn: companion`): the
   *  companion is ready to see the taught action happen. */
  onReady: () => void;
}

/**
 * The one place a spec's `companion` id becomes a component, so a spec stays
 * plain data and the runner stays content-agnostic: it mounts whatever this
 * returns beside the beat's spotlight. Companions render nothing.
 */
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
