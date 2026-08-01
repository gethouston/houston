import { KanbanDetailPanel } from "@houston-ai/board";
import { TooltipProvider } from "@houston-ai/core";

import type { Specimen } from "../../../src/specimen";
import {
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";
import {
  FullPanel,
  LeadingPanel,
  PANEL_AVATAR,
  PANEL_PROPS,
  PanelBody,
  PanelFrame,
} from "./kanban-detail-panel-parts";

/** The statuses the header words, in the order the board's sections run. */
const STATUSES = ["running", "needs_you", "done", "error"];

function KanbanDetailPanelSpecimen() {
  return (
    <TooltipProvider>
      <SpecimenPage
        title="KanbanDetailPanel"
        intro="The header over an open mission: who is working on it, which mission it is, where it stands, and the controls for it. The chat below is the consumer's."
      >
        <SpecimenSection
          title="Variants"
          note="`agentName` decides the header's shape. With it, the agent leads and the mission drops to the line beneath; without it, `title` leads and `subtitle` follows. The header is borderless on the chat canvas tone on purpose — header, chat and pane are one surface, with no seam between them."
        >
          <SpecimenRow label="Agent and mission">
            <FullPanel />
          </SpecimenRow>
          <SpecimenRow label="Title and subtitle">
            <PanelFrame>
              <KanbanDetailPanel
                avatar={PANEL_AVATAR}
                title="Weekly report"
                subtitle="Every Friday at 17:00"
                onClose={() => {}}
              >
                <PanelBody />
              </KanbanDetailPanel>
            </PanelFrame>
          </SpecimenRow>
          <SpecimenRow label="Leading slot, no close">
            <LeadingPanel />
          </SpecimenRow>
        </SpecimenSection>

        <SpecimenSection
          title="States"
          note="Status is a word, not a badge — it trails the mission line after a middot. Only a running status adds anything: a spinner joins the right-hand cluster and the word is tinted, with the one raw colour left in this component (`text-blue-500`, not a token). Unknown statuses render verbatim, so a consumer's own vocabulary never shows a blank."
        >
          {STATUSES.map((status) => (
            <SpecimenRow key={status} label={status}>
              <PanelFrame>
                <KanbanDetailPanel
                  avatar={PANEL_AVATAR}
                  agentName="Inbox Zero"
                  title="Triage this morning's 34 unread threads"
                  status={status}
                  onClose={() => {}}
                >
                  <PanelBody />
                </KanbanDetailPanel>
              </PanelFrame>
            </SpecimenRow>
          ))}
        </SpecimenSection>

        <SpecimenSection
          title="Sizes"
          note="One size, capped: the header's row is centred at the same max-w-3xl measure as the message column below it, so a full-width panel does not strand the header at the far left. Below that width the cap never engages and a narrow mission panel looks untouched."
        >
          <SpecimenRow label="Full width">
            <div className="h-56 w-full overflow-hidden rounded-xl border border-line bg-background">
              <KanbanDetailPanel
                avatar={PANEL_AVATAR}
                agentName="Meeting Notes"
                title="Monday standup summary"
                status="running"
                onClose={() => {}}
              >
                <PanelBody />
              </KanbanDetailPanel>
            </div>
          </SpecimenRow>
        </SpecimenSection>

        <SpecimenProps items={PANEL_PROPS} />

        <SpecimenTokens
          classes={[
            "bg-background",
            "bg-chip",
            "text-ink",
            "text-ink-muted",
            "bg-hover/50",
            "border-line",
          ]}
        />
      </SpecimenPage>
    </TooltipProvider>
  );
}

export const sources: string[] = ["KanbanDetailPanel"];

export const specimen: Specimen = {
  id: "board-kanban-detail-panel",
  title: "KanbanDetailPanel",
  group: "Activity",
  render: () => <KanbanDetailPanelSpecimen />,
};
