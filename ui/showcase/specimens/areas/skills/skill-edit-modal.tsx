import { deriveInstalledSkillEditorState } from "@houston-ai/skills";

import type { Specimen } from "../../../src/specimen";
import {
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";
import { installedSkills } from "./sample";
import { EditDemo, editProps } from "./skill-edit-modal-parts";

const [, inboxTriage] = installedSkills;

const INSTRUCTIONS = `# Inbox triage

## Procedure

1. Read every unread thread in the shared mailbox.
2. Draft the reply Inbox Zero would send, in the founder's voice.
3. File receipts under Finance and never reply to them.
4. Escalate anything with a contract attached — do not answer it.

## Notes

Never send. Drafts only, always.
`;

/** The four states, derived exactly as an expanded row derives them. */
const loading = deriveInstalledSkillEditorState({
  expanded: true,
  content: undefined,
  hasError: false,
});
const ready = deriveInstalledSkillEditorState({
  expanded: true,
  content: INSTRUCTIONS,
  hasError: false,
});
const failed = deriveInstalledSkillEditorState({
  expanded: true,
  content: undefined,
  hasError: true,
});

function SkillEditModalSpecimen() {
  return (
    <SpecimenPage
      title="Skill edit modal"
      intro="An installed skill's one detail surface: its name and the apps it works with over the raw SKILL.md in a monospace editor, with Save, Cancel and — where the agent allows it — Delete."
    >
      <SpecimenSection
        title="Variants"
        note="The header and footer vary with what the host wires: the apps row, the description line, and the destructive action are each optional."
      >
        <SpecimenRow label="Full">
          <EditDemo
            label="Edit inbox-triage"
            displayName="Inbox triage"
            description={inboxTriage.description}
            editor={ready}
            withDelete
            withIntegrations
          />
        </SpecimenRow>
        <SpecimenRow label="No apps row">
          <EditDemo
            label="Edit weekly-report"
            variant="outline"
            displayName="Weekly report"
            description="Pulls Friday's numbers and writes the update the team reads on Monday."
            editor={ready}
            withDelete
          />
        </SpecimenRow>
        <SpecimenRow label="No description">
          <EditDemo
            label="Edit draft-contract"
            variant="outline"
            displayName="Draft a contract"
            description=""
            editor={ready}
            withDelete
          />
        </SpecimenRow>
        <SpecimenRow label="Read-only agent (no Delete)">
          <EditDemo
            label="Edit meeting-notes"
            variant="outline"
            displayName="Meeting notes"
            description="Turns the Meeting Notes transcript into a summary and files the follow-ups."
            editor={ready}
          />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="`deriveInstalledSkillEditorState` maps the host's fetch onto the four the modal renders. `idle` is the collapsed row — the modal isn't open then — so what is under review here is loading, ready and error."
      >
        <SpecimenRow label="Loading">
          <EditDemo
            label="Instructions loading"
            displayName="Inbox triage"
            description={inboxTriage.description}
            editor={loading}
            withDelete
          />
        </SpecimenRow>
        <SpecimenRow label="Ready">
          <EditDemo
            label="Instructions loaded"
            variant="outline"
            displayName="Inbox triage"
            description={inboxTriage.description}
            editor={ready}
            withDelete
          />
          <p className="max-w-prose text-[13px] text-ink-muted leading-[1.4]">
            Save is disabled until the draft differs from what loaded, then
            reads Saving... while the promise is in flight.
          </p>
        </SpecimenRow>
        <SpecimenRow label="Load failed">
          <EditDemo
            label="Instructions unavailable"
            variant="outline"
            displayName="Inbox triage"
            description={inboxTriage.description}
            editor={failed}
            withDelete
          />
          <p className="max-w-prose text-[13px] text-ink-muted leading-[1.4]">
            Non-blocking: the note replaces the editor, Cancel and Delete still
            work, and Save has nothing to commit.
          </p>
        </SpecimenRow>
        <SpecimenRow label="Long title and description">
          <EditDemo
            label="Truncation"
            variant="secondary"
            displayName="Triage the shared founders mailbox every single morning"
            description="Reads every unread thread in the shared mailbox, drafts the reply Inbox Zero would send, files the receipts under Finance, and escalates anything with a contract attached so nothing ships without a human reading it first."
            editor={ready}
            withDelete
            withIntegrations
          />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenProps items={editProps} />

      <SpecimenTokens
        classes={[
          "bg-dialog",
          "text-ink",
          "text-ink-muted",
          "bg-chip",
          "border-line",
        ]}
      />
    </SpecimenPage>
  );
}

/**
 * The `@houston-ai/*` symbols this page documents. `scripts/gen-usage.mjs`
 * reads them to build the "Used in" map, so they are the exported names
 * exactly as a consumer imports them.
 */
export const sources: string[] = [
  "SkillEditModal",
  "deriveInstalledSkillEditorState",
];

export const specimen: Specimen = {
  id: "skills-edit-modal",
  title: "Skill edit modal",
  group: "Skills",
  render: () => <SkillEditModalSpecimen />,
};
