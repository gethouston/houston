import type { Activity } from "@houston/engine-adapter";
import type { ReactNode } from "react";
import type { Agent } from "../../lib/types";

export interface RoutineSetupChatBoardProps {
  agent: Agent;
  activity: Activity;
  sessionKey: string | null;
  panelContainer: HTMLElement | null;
  panelLeading?: ReactNode;
  onPanelClose?: () => void;
  missionLabel?: string;
  panelActions?: ReactNode;
  promptContext?: string;
  disableComposerAutoFocus?: boolean;
}
