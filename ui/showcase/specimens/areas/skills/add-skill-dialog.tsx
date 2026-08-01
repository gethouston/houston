import { Button } from "@houston-ai/core";
import type { AddSkillDialogProps } from "@houston-ai/skills";
import { AddSkillDialog } from "@houston-ai/skills";
import { useState } from "react";

import type { Specimen } from "../../../src/specimen";
import {
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";
import { dialogProps, repoStages } from "./add-skill-dialog-parts";
import {
  createFromScratch,
  failListFromRepo,
  installFromRepo,
  listFromRepo,
} from "./handlers";
import { installedSlugs } from "./sample";

type DemoProps = Omit<AddSkillDialogProps, "open" | "onOpenChange">;

/** The dialog behind its own trigger — every row opens the real thing. */
function DialogDemo({
  label,
  variant,
  ...props
}: DemoProps & { label: string; variant?: "outline" | "secondary" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <AddSkillDialog {...props} open={open} onOpenChange={setOpen} />
    </>
  );
}

function AddSkillDialogSpecimen() {
  return (
    <SpecimenPage
      title="Add skill dialog"
      intro="The two ways a skill gets onto an agent: install every SKILL.md in a public GitHub repo, or write one by hand. A fixed-size dialog, so switching tabs never resizes it."
    >
      <SpecimenSection
        title="Variants"
        note="The tabs are derived, not configured: a tab exists only where its callbacks do, and a lone tab renders no tab strip at all."
      >
        <SpecimenRow label="Both tabs">
          <DialogDemo
            label="Add actions"
            onListFromRepo={listFromRepo}
            onInstallFromRepo={installFromRepo}
            onCreateFromScratch={createFromScratch}
            installedSkillNames={installedSlugs}
          />
        </SpecimenRow>
        <SpecimenRow label="GitHub only">
          <DialogDemo
            label="Install from GitHub"
            variant="outline"
            onListFromRepo={listFromRepo}
            onInstallFromRepo={installFromRepo}
          />
        </SpecimenRow>
        <SpecimenRow label="From scratch only">
          <DialogDemo
            label="Write a skill"
            variant="outline"
            onCreateFromScratch={createFromScratch}
            installedSkillNames={installedSlugs}
          />
        </SpecimenRow>
        <SpecimenRow label="Translated">
          <DialogDemo
            label="Añadir acciones"
            variant="secondary"
            onListFromRepo={listFromRepo}
            onInstallFromRepo={installFromRepo}
            onCreateFromScratch={createFromScratch}
            labels={{
              title: "Añadir acciones",
              description:
                "Instala procedimientos reutilizables para tu agente.",
              repoTab: "GitHub",
              scratchTab: "Desde cero",
              repo: { findSkills: "Buscar skills" },
            }}
          />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="The GitHub view is a five-stage machine. Open the dialog above, type any owner/repo — `anthropics/skills` — and press Find skills to walk it; the fixtures resolve on a timer so each stage is visible."
      >
        {repoStages.map((one) => (
          <SpecimenRow key={one.stage} label={one.stage}>
            <p className="max-w-prose text-[15px] text-ink leading-[1.55]">
              {one.what}
            </p>
          </SpecimenRow>
        ))}
        <SpecimenRow label="Repo error">
          <DialogDemo
            label="Repo that can't be read"
            variant="outline"
            onListFromRepo={failListFromRepo}
            onInstallFromRepo={installFromRepo}
          />
          <p className="max-w-prose text-[13px] text-ink-muted leading-[1.4]">
            The rejection's message renders under the field and the view drops
            back to input — nothing is swallowed.
          </p>
        </SpecimenRow>
        <SpecimenRow label="Slug already taken">
          <DialogDemo
            label="Author a duplicate"
            variant="outline"
            onCreateFromScratch={createFromScratch}
            installedSkillNames={installedSlugs}
          />
          <p className="max-w-prose text-[13px] text-ink-muted leading-[1.4]">
            On From scratch, title it “Inbox triage”: the derived slug turns red
            against `installedSkillNames` and Create stays disabled.
          </p>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenProps items={dialogProps} />

      <SpecimenTokens
        classes={[
          "bg-hover",
          "text-ink",
          "text-ink-muted",
          "bg-input",
          "border-line",
          "focus:ring-focus",
          "text-danger",
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
export const sources: string[] = ["AddSkillDialog"];

export const specimen: Specimen = {
  id: "skills-add-skill-dialog",
  title: "Add skill dialog",
  group: "Skills",
  render: () => <AddSkillDialogSpecimen />,
};
