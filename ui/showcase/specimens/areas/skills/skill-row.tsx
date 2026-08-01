import { SkillRow } from "@houston-ai/skills";
import type { ReactNode } from "react";
import { useState } from "react";

import type { Specimen } from "../../../src/specimen";
import {
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";
import { installedSkills } from "./sample";

const [weeklyReport, inboxTriage, draftContract] = installedSkills;

/**
 * The container `SkillsGrid` gives the row: a gray card with hairline
 * dividers. The row itself is transparent, so it is only ever reviewed on it.
 */
function RowShell({ children }: { children: ReactNode }) {
  return (
    <div className="w-full max-w-md divide-y divide-line/60 overflow-hidden rounded-xl bg-chip">
      {children}
    </div>
  );
}

/** A row wired to real handlers, with the last action echoed under it. */
function LiveRows() {
  const [opened, setOpened] = useState<string | null>(null);
  const [deleted, setDeleted] = useState<string | null>(null);
  return (
    <div className="flex w-full max-w-md flex-col gap-2">
      <RowShell>
        {installedSkills.map((skill) => (
          <SkillRow
            key={skill.id}
            skill={skill}
            onClick={() => setOpened(skill.name)}
            onDelete={() => setDeleted(skill.name)}
          />
        ))}
      </RowShell>
      <p className="text-[13px] text-ink-muted leading-[1.4]">
        {deleted
          ? `Delete requested for ${deleted}.`
          : opened
            ? `Opened ${opened}.`
            : "Click a row to open it, or use its menu to delete."}
      </p>
    </div>
  );
}

function SkillRowSpecimen() {
  return (
    <SpecimenPage
      title="Skill row"
      intro="One installed skill in the Actions list: the whole row opens it, and delete hides in an overflow menu so a destructive action is never one stray click away."
    >
      <SpecimenSection
        title="Variants"
        note="No style variants. The row varies by what the skill carries and by whether the host wired `onDelete`."
      >
        <SpecimenRow label="Name and description">
          <RowShell>
            <SkillRow skill={inboxTriage} onClick={() => undefined} />
          </RowShell>
        </SpecimenRow>
        <SpecimenRow label="No description">
          <RowShell>
            <SkillRow skill={draftContract} onClick={() => undefined} />
          </RowShell>
        </SpecimenRow>
        <SpecimenRow label="With the overflow menu">
          <RowShell>
            <SkillRow
              skill={weeklyReport}
              onClick={() => undefined}
              onDelete={() => undefined}
            />
          </RowShell>
        </SpecimenRow>
        <SpecimenRow label="A list of them">
          <RowShell>
            {installedSkills.map((skill) => (
              <SkillRow
                key={skill.id}
                skill={skill}
                onClick={() => undefined}
                onDelete={() => undefined}
              />
            ))}
          </RowShell>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="Hover or tab in: one fill covers the whole row. There is no disabled, no busy and no selected state — the row is a link to the skill, nothing more."
      >
        <SpecimenRow label="Live">
          <LiveRows />
        </SpecimenRow>
        <SpecimenRow label="Slug humanized">
          <RowShell>
            <SkillRow
              skill={{
                ...weeklyReport,
                name: "weekly_revenue-report",
              }}
              onClick={() => undefined}
            />
          </RowShell>
        </SpecimenRow>
        <SpecimenRow label="Truncation">
          <RowShell>
            <SkillRow
              skill={{
                ...inboxTriage,
                name: "triage-the-shared-founders-mailbox-every-single-morning",
                description:
                  "Reads every unread thread in the shared mailbox, drafts the reply Inbox Zero would send, files the receipts, and escalates anything with a contract attached so nothing ships without a human. Clamped to two lines.",
              }}
              onClick={() => undefined}
              onDelete={() => undefined}
            />
          </RowShell>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="Sizes"
        note="One size: `px-5 py-4`, a 14px title over a 12px description. Density comes from the list, never from a size prop."
      >
        <SpecimenRow label="Row rhythm">
          <RowShell>
            <SkillRow skill={weeklyReport} onClick={() => undefined} />
            <SkillRow skill={inboxTriage} onClick={() => undefined} />
          </RowShell>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenProps
        items={[
          {
            name: "skill",
            type: "Skill",
            note: "The installed skill. `name` is the slug — the row humanizes it for display; `description` renders only when non-empty.",
          },
          {
            name: "onClick",
            type: "() => void",
            note: "Opens the skill. Required — the whole row is the trigger, Enter and Space included.",
          },
          {
            name: "onDelete",
            type: "() => void",
            note: "Optional. Adds the overflow menu with its destructive Delete item; omitted, the row carries no menu.",
          },
        ]}
      />

      <SpecimenTokens
        classes={[
          "text-ink",
          "text-ink-muted",
          "hover:bg-ink/[0.03]",
          "focus-visible:bg-ink/[0.03]",
          "bg-transparent",
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
export const sources: string[] = ["SkillRow"];

export const specimen: Specimen = {
  id: "skills-skill-row",
  title: "Skill row",
  group: "Skills",
  render: () => <SkillRowSpecimen />,
};
