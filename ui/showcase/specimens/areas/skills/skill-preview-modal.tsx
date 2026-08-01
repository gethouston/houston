import type { Specimen } from "../../../src/specimen";
import {
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";
import { bareSkillPreview, communitySkills, skillPreview } from "./sample";
import { PreviewDemo, previewProps } from "./skill-preview-modal-parts";

const [contracts, triage, , , oneInstall] = communitySkills;

function SkillPreviewModalSpecimen() {
  return (
    <SpecimenPage
      title="Skill preview modal"
      intro="What a marketplace row opens: the skill's real SKILL.md — description, the apps it needs, its category and tags, the full instructions behind an expander — over one full-width install button."
    >
      <SpecimenSection
        title="Variants"
        note="Every block below the header renders only when the loaded preview carries it, so a bare skill shows a header, a note and the button — never an empty heading."
      >
        <SpecimenRow label="Full preview">
          <PreviewDemo
            label="Contract drafting"
            skill={contracts}
            preview={{ status: "loaded", preview: skillPreview }}
          />
        </SpecimenRow>
        <SpecimenRow label="With the apps section">
          <PreviewDemo
            label="Contract drafting + apps"
            variant="outline"
            skill={contracts}
            preview={{ status: "loaded", preview: skillPreview }}
            withIntegrations
          />
        </SpecimenRow>
        <SpecimenRow label="Bare skill">
          <PreviewDemo
            label="No description"
            variant="outline"
            skill={oneInstall}
            preview={{ status: "loaded", preview: bareSkillPreview }}
          />
        </SpecimenRow>
        <SpecimenRow label="Description formatting">
          <PreviewDemo
            label="Enumerated description"
            variant="secondary"
            skill={contracts}
            preview={{ status: "loaded", preview: skillPreview }}
          />
          <p className="max-w-prose text-[13px] text-ink-muted leading-[1.4]">
            SKILL.md frontmatter is written for tool matching, not for reading:
            the `(1) … (2) …` run-on becomes a real list and the trailing
            `Triggers on:` clause becomes the muted “Also matches” caption.
          </p>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="The fetch has three; install has three more. A failed fetch degrades to a warning line and leaves install enabled — the description is a nicety, the install is the point."
      >
        <SpecimenRow label="Loading">
          <PreviewDemo
            label="Fetching SKILL.md"
            skill={contracts}
            preview={{ status: "loading" }}
          />
        </SpecimenRow>
        <SpecimenRow label="Loaded">
          <PreviewDemo
            label="Loaded"
            variant="outline"
            skill={contracts}
            preview={{ status: "loaded", preview: skillPreview }}
          />
        </SpecimenRow>
        <SpecimenRow label="Fetch failed">
          <PreviewDemo
            label="Description unavailable"
            variant="outline"
            skill={contracts}
            preview={{ status: "error" }}
          />
        </SpecimenRow>
        <SpecimenRow label="Installing">
          <PreviewDemo
            label="Installing"
            variant="outline"
            skill={triage}
            preview={{ status: "loaded", preview: skillPreview }}
            installing
          />
        </SpecimenRow>
        <SpecimenRow label="Installed">
          <PreviewDemo
            label="Already installed"
            variant="outline"
            skill={triage}
            preview={{ status: "loaded", preview: skillPreview }}
            installed
          />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenProps items={previewProps} />

      <SpecimenTokens
        classes={[
          "bg-dialog",
          "text-ink",
          "text-ink-muted",
          "bg-chip",
          "border-line",
          "bg-action",
          "text-action-text",
          "hover:bg-action/90",
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
export const sources: string[] = ["SkillPreviewModal"];

export const specimen: Specimen = {
  id: "skills-preview-modal",
  title: "Skill preview modal",
  group: "Skills",
  render: () => <SkillPreviewModalSpecimen />,
};
