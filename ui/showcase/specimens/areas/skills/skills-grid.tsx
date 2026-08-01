import type { Skill } from "@houston-ai/skills";
import { SkillsGrid } from "@houston-ai/skills";
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
import {
  createFromScratch,
  deleteSkill,
  installFromRepo,
  listFromRepo,
} from "./handlers";
import { installedSkills, installedSlugs } from "./sample";
import { gridProps } from "./skills-grid-parts";

/** The white page body the tab gives the surface, bounded to a real measure. */
function Frame({ children }: { children: ReactNode }) {
  return <div className="flex w-full max-w-2xl flex-col">{children}</div>;
}

/** The grid with its own list, so Add and Delete really change it. */
function LiveGrid() {
  const [skills, setSkills] = useState<Skill[]>(installedSkills);
  const [opened, setOpened] = useState<string | null>(null);
  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <SkillsGrid
        skills={skills}
        loading={false}
        onSkillClick={(skill) => setOpened(skill.name)}
        onDelete={async (name) => {
          await deleteSkill(name);
          setSkills((current) => current.filter((one) => one.name !== name));
        }}
        onListFromRepo={listFromRepo}
        onInstallFromRepo={installFromRepo}
        onCreateFromScratch={createFromScratch}
        installedSkillNames={installedSlugs}
      />
      <p className="text-[13px] text-ink-muted leading-[1.4]">
        {opened ? `Opened ${opened}.` : "Click a skill to open it."}
      </p>
    </div>
  );
}

function SkillsGridSpecimen() {
  return (
    <SpecimenPage
      title="Skills grid"
      intro="The installed-skills surface: a count line and an Add button over one gray card of skill rows, or a centred empty state when the agent has none."
    >
      <SpecimenSection
        title="Variants"
        note="Which capabilities the host wires decides what the surface offers. No callbacks, no Add button — a read-only agent sees the list and nothing else."
      >
        <SpecimenRow label="Full capability">
          <Frame>
            <SkillsGrid
              skills={installedSkills}
              loading={false}
              onSkillClick={() => undefined}
              onDelete={deleteSkill}
              onListFromRepo={listFromRepo}
              onInstallFromRepo={installFromRepo}
              onCreateFromScratch={createFromScratch}
              installedSkillNames={installedSlugs}
            />
          </Frame>
        </SpecimenRow>
        <SpecimenRow label="Read-only">
          <Frame>
            <SkillsGrid
              skills={installedSkills}
              loading={false}
              onSkillClick={() => undefined}
            />
          </Frame>
        </SpecimenRow>
        <SpecimenRow label="Scratch authoring only">
          <Frame>
            <SkillsGrid
              skills={installedSkills}
              loading={false}
              onSkillClick={() => undefined}
              onCreateFromScratch={createFromScratch}
            />
          </Frame>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="Three: loading before the first list arrives, empty, and populated. Deleting is confirm-gated, and the confirm names the skill."
      >
        <SpecimenRow label="Loading">
          <Frame>
            <div className="flex h-24">
              <SkillsGrid skills={[]} loading onSkillClick={() => undefined} />
            </div>
          </Frame>
        </SpecimenRow>
        <SpecimenRow label="Empty, can add">
          <Frame>
            <SkillsGrid
              skills={[]}
              loading={false}
              onSkillClick={() => undefined}
              onCreateFromScratch={createFromScratch}
            />
          </Frame>
        </SpecimenRow>
        <SpecimenRow label="Empty, read-only">
          <Frame>
            <SkillsGrid
              skills={[]}
              loading={false}
              onSkillClick={() => undefined}
            />
          </Frame>
        </SpecimenRow>
        <SpecimenRow label="Live: add and delete">
          <LiveGrid />
        </SpecimenRow>
        <SpecimenRow label="Translated labels">
          <Frame>
            <SkillsGrid
              skills={installedSkills}
              loading={false}
              onSkillClick={() => undefined}
              onCreateFromScratch={createFromScratch}
              labels={{
                addSkill: "Añadir skill",
                descriptionShort:
                  "Procedimientos reutilizables en los que tu agente se apoya.",
              }}
            />
          </Frame>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenProps items={gridProps} />

      <SpecimenTokens
        classes={["bg-chip", "divide-line/60", "text-ink-muted", "text-ink"]}
      />
    </SpecimenPage>
  );
}

/**
 * The `@houston-ai/*` symbols this page documents. `scripts/gen-usage.mjs`
 * reads them to build the "Used in" map, so they are the exported names
 * exactly as a consumer imports them.
 */
export const sources: string[] = ["SkillsGrid"];

export const specimen: Specimen = {
  id: "skills-skills-grid",
  title: "Skills grid",
  group: "Skills",
  render: () => <SkillsGridSpecimen />,
};
