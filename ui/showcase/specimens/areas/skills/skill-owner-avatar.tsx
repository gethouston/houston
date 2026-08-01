import { PoweredByVercelBadge, SkillOwnerAvatar } from "@houston-ai/skills";

import type { Specimen } from "../../../src/specimen";
import {
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";

/** The owners behind the marketplace fixtures, as `owner/repo` resolves them. */
const OWNERS = ["anthropics", "vercel", "julian"];

function SkillOwnerAvatarSpecimen() {
  return (
    <SpecimenPage
      title="Skill owner avatar"
      intro="Who published a skill: the GitHub owner's real avatar, full-colour by design, with an initial-letter fallback that occupies exactly the same box. Beside it, the marketplace's attribution mark."
    >
      <SpecimenSection
        title="Variants"
        note="One variant axis, `size`. The image is loaded from `github.com/<owner>.png`; anything that fails to load degrades to the letter without moving the layout."
      >
        <SpecimenRow label="Real owners">
          {OWNERS.map((owner) => (
            <SkillOwnerAvatar key={owner} owner={owner} size="lg" />
          ))}
        </SpecimenRow>
        <SpecimenRow label="Beside a name">
          <span className="inline-flex items-center gap-3">
            <SkillOwnerAvatar owner="anthropics" size="lg" />
            <span className="flex flex-col">
              <span className="text-[15px] text-ink leading-[1.55]">
                Contract Drafting
              </span>
              <span className="text-[13px] text-ink-muted leading-[1.4]">
                by anthropics · 39.5K installs
              </span>
            </span>
          </span>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="Loaded and fallback are the whole set — there is no hover, no focus and no busy state. The box is `bg-chip` in both, so a slow image never flashes an empty hole. `owner` is the ONLY input: the URL is built from it, so these rows need the network to tell the two states apart."
      >
        <SpecimenRow label="Image loads">
          <SkillOwnerAvatar owner="vercel" size="lg" />
        </SpecimenRow>
        <SpecimenRow label="Fallback (no such owner) — the letter">
          <SkillOwnerAvatar owner="houston-does-not-exist" size="lg" />
        </SpecimenRow>
        <SpecimenRow label="Fallback (empty owner) — no letter to draw">
          {/* An empty owner has no first character, so this box is deliberately
              blank: the component keeps the layout, not the initial. Shown
              because a skill with a missing owner IS reachable in the product,
              and a reviewer should see what it looks like. */}
          <SkillOwnerAvatar owner="" size="lg" />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="Sizes"
        note="`sm` 24px, `md` 32px (the default), `lg` 40px — the size the marketplace row and the preview modal both use."
      >
        <SpecimenRow label="sm / md / lg">
          <SkillOwnerAvatar owner="anthropics" size="sm" />
          <SkillOwnerAvatar owner="anthropics" size="md" />
          <SkillOwnerAvatar owner="anthropics" size="lg" />
        </SpecimenRow>
        <SpecimenRow label="Fallback at each size">
          <SkillOwnerAvatar owner="houston-does-not-exist" size="sm" />
          <SkillOwnerAvatar owner="houston-does-not-exist" size="md" />
          <SkillOwnerAvatar owner="houston-does-not-exist" size="lg" />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="Attribution"
        note="`PoweredByVercelBadge` is the marketplace's one credit line: the Vercel logomark in `currentColor` and a label, sized to sit inline with a subheading."
      >
        <SpecimenRow label="Default label">
          <PoweredByVercelBadge />
        </SpecimenRow>
        <SpecimenRow label="Translated label">
          <PoweredByVercelBadge label="Con tecnología de Vercel" />
        </SpecimenRow>
        <SpecimenRow label="In a section subheading">
          <span className="flex flex-wrap items-center gap-x-2 text-[13px] text-ink-muted leading-[1.4]">
            <span>Add ready-made skills from the community</span>
            <PoweredByVercelBadge />
          </span>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenProps
        items={[
          {
            name: "owner",
            type: "string",
            note: "SkillOwnerAvatar. The GitHub login, taken from the skill's `owner/repo` source. Empty renders the fallback.",
          },
          {
            name: "size",
            type: '"sm" | "md" | "lg"',
            note: "SkillOwnerAvatar. Defaults to `md`.",
          },
          {
            name: "label",
            type: "string",
            note: 'PoweredByVercelBadge. Already-translated text; defaults to "Powered by Vercel".',
          },
          {
            name: "className",
            type: "string",
            note: "Merged onto the avatar box / the badge span.",
          },
        ]}
      />

      <SpecimenTokens classes={["bg-chip", "text-ink-muted"]} />
    </SpecimenPage>
  );
}

/**
 * The `@houston-ai/*` symbols this page documents. `scripts/gen-usage.mjs`
 * reads them to build the "Used in" map, so they are the exported names
 * exactly as a consumer imports them.
 */
export const sources: string[] = ["SkillOwnerAvatar", "PoweredByVercelBadge"];

export const specimen: Specimen = {
  id: "skills-owner-avatar",
  title: "Skill owner avatar",
  group: "Skills",
  render: () => <SkillOwnerAvatarSpecimen />,
};
