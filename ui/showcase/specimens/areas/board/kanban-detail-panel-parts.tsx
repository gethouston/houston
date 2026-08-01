import { KanbanDetailPanel } from "@houston-ai/board";
import { Button } from "@houston-ai/core";
import { ArrowLeft, Bot } from "lucide-react";
import type { ReactNode } from "react";

import type { SpecimenProp } from "../../../src/specimen";
import { NEEDS_YOU_MISSION, PEOPLE } from "./sample";

/**
 * The panel's frame, its stock body, and its props table. Helper module: it
 * exports no `specimen`.
 */

/** The panel is a full-height pane beside the board, so it is reviewed as one. */
export function PanelFrame({ children }: { children: ReactNode }) {
  return (
    <div className="h-64 w-full max-w-xl overflow-hidden rounded-xl border border-line bg-background">
      {children}
    </div>
  );
}

/** The header's avatar: the same agent helmet the board's cards wear, large. */
export const PANEL_AVATAR = (
  <Bot className="size-8 shrink-0 rounded-full bg-chip p-1.5 text-ink-muted" />
);

/** Stand-in for the mission's chat, so the header is judged against a body. */
export function PanelBody() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-3 text-[13px] text-ink-muted leading-relaxed">
      Dana wrote in twice about the duplicate charge. I drafted a reply that
      apologises, confirms the refund of the full amount, and says it lands in
      three business days. Send it?
    </div>
  );
}

/** A panel with everything on: agent name, mission line, status, people. */
export function FullPanel() {
  return (
    <PanelFrame>
      <KanbanDetailPanel
        avatar={PANEL_AVATAR}
        agentName="Inbox Zero"
        title={NEEDS_YOU_MISSION.title}
        status="needs_you"
        people={PEOPLE.slice(0, 4)}
        peopleExpandLabel="All people"
        onClose={() => {}}
        actions={
          <Button variant="outline" size="sm">
            Send it
          </Button>
        }
      >
        <PanelBody />
      </KanbanDetailPanel>
    </PanelFrame>
  );
}

/** The full-page shape: a Back button leads, and nothing closes the panel. */
export function LeadingPanel() {
  return (
    <PanelFrame>
      <KanbanDetailPanel
        leading={
          <Button variant="ghost" size="icon" aria-label="Back to the board">
            <ArrowLeft className="size-4" />
          </Button>
        }
        avatar={PANEL_AVATAR}
        agentName="Meeting Notes"
        title="Monday standup summary"
        missionLabelOverride="Archived mission"
        status="done"
      >
        <PanelBody />
      </KanbanDetailPanel>
    </PanelFrame>
  );
}

export const PANEL_PROPS: SpecimenProp[] = [
  {
    name: "title",
    type: "string",
    note: 'The mission name. With `agentName` set it becomes the "Mission: …" line.',
  },
  {
    name: "agentName",
    type: "string",
    note: "Promoted to the header's main line, with the mission line beneath it.",
  },
  {
    name: "subtitle",
    type: "string",
    note: "The second line when there is no `agentName`.",
  },
  {
    name: "missionLabelOverride",
    type: "string",
    note: 'Replaces the generated "Mission: {title}" line verbatim.',
  },
  {
    name: "status / statusLabels / runningStatuses",
    type: "string | Record<string, string> | string[]",
    note: "The trailing status word, its lookup table, and which statuses spin.",
  },
  {
    name: "avatar / leading",
    type: "React.ReactNode",
    note: "The agent helmet, and a slot before it (a Back button on a full page).",
  },
  {
    name: "actions",
    type: "React.ReactNode",
    note: "Consumer controls, placed before the close button.",
  },
  {
    name: "onClose",
    type: "() => void",
    note: "Omit it and no close button renders — a companion panel with no dismiss.",
  },
  {
    name: "people / peopleLabel / peopleExpandLabel",
    type: "KanbanPerson[] | string",
    note: 'The header face stack (md, on the background surface) and its labels. Default "People".',
  },
  {
    name: "children",
    type: "React.ReactNode",
    note: "The mission's chat. The panel owns only the header above it.",
  },
];
