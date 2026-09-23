import type { Activity } from "@houston/engine-adapter";
import type { ReactNode } from "react";
import type { Agent } from "../../lib/types";

/** The setup-chat board's inputs, shared by the routine, skill and custom-integration chats. */
export interface RoutineSetupChatBoardProps {
  /** The agent this chat runs against: its engine answers, its folder resolves
   *  links, and the panel shows its avatar, colour and name. */
  agent: Agent;
  activity: Activity;
  sessionKey: string | null;
  /** The shell-level panel node this board portals its detail panel into — the
   *  SAME app-wide panel the Activity mission board opens (one shared UI path). */
  panelContainer: HTMLElement | null;
  /** Leading slot before the agent avatar (the integration chat's Back button).
   *  Omit for none — the routines split deselects via the close X instead. */
  panelLeading?: ReactNode;
  /** Deselect handler: when supplied, the panel shows its close X and clicking
   *  it deselects the item (closing the pane). Omit for a non-dismissable
   *  companion (the integration chat exits via its own chrome). */
  onPanelClose?: () => void;
  /** Overrides the panel's task line (routines pass "Routine: {name}"). Omit
   *  to keep the localized "Task: {title}" — the custom-integration setup chat
   *  reuses this board and IS a task, so it wants that line. */
  missionLabel?: string;
  /** Header actions on the panel's right side (the integration setup chat
   *  puts its "Done" button here). Omit for none (routines). */
  panelActions?: ReactNode;
  /** Model-facing context prepended to every outgoing prompt, hidden from
   *  the transcript (the skill chat pins its bound skill). Omit for none. */
  promptContext?: string;
  /** A chat that opens BESIDE a form the user may already be typing in (the
   *  skill editor's companion chat) must not pull focus into its composer;
   *  a chat the user asked for is the thing to type in, so it takes focus. */
  disableComposerAutoFocus?: boolean;
}
