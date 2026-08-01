import { HoustonAvatar, HoustonHelmet } from "@houston-ai/core";
import type { Specimen } from "../../../src/specimen";
import {
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";

/** The agent palette, straight off the `--ht-agent-*` tokens. */
const AGENT_COLORS = [
  { name: "charcoal", color: "var(--ht-agent-charcoal)" },
  { name: "forest", color: "var(--ht-agent-forest)" },
  { name: "navy", color: "var(--ht-agent-navy)" },
  { name: "purple", color: "var(--ht-agent-purple)" },
  { name: "crimson", color: "var(--ht-agent-crimson)" },
  { name: "orange", color: "var(--ht-agent-orange)" },
  { name: "golden", color: "var(--ht-agent-golden)" },
];

function HoustonAvatarSpecimen() {
  return (
    <SpecimenPage
      title="HoustonAvatar"
      intro="An agent's identity glyph: the Houston helmet on a tinted disc, with a comet halo while it works."
    >
      <SpecimenSection
        title="Variants"
        note="No `variant` prop. The axes are `color` (a token reference, never a literal), `running`, and the bare `HoustonHelmet` glyph underneath."
      >
        <SpecimenRow label="Default (Houston gray)">
          <HoustonAvatar />
        </SpecimenRow>
        <SpecimenRow label="Agent palette">
          {AGENT_COLORS.map((agent) => (
            <span key={agent.name} className="flex flex-col items-center gap-2">
              <HoustonAvatar color={agent.color} />
              <span className="text-[13px] leading-[1.4] text-ink-muted">
                {agent.name}
              </span>
            </span>
          ))}
        </SpecimenRow>
        <SpecimenRow label="HoustonHelmet (no disc)">
          <HoustonHelmet />
          <HoustonHelmet color="var(--ht-agent-purple)" size={32} />
          <HoustonHelmet color="var(--ht-agent-forest)" size={48} />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="`running` is the only state: it wraps the disc in the shared `.avatar-running-ring` halo from core's globals and shrinks the disc by 2px so the total diameter never changes."
      >
        <SpecimenRow label="Resting">
          <HoustonAvatar color="var(--ht-agent-navy)" />
          <HoustonAvatar color="var(--ht-agent-forest)" />
        </SpecimenRow>
        <SpecimenRow label="Running (live halo)">
          <HoustonAvatar color="var(--ht-agent-navy)" running />
          <HoustonAvatar color="var(--ht-agent-forest)" running />
        </SpecimenRow>
        <SpecimenRow label="Beside an agent name">
          <span className="inline-flex items-center gap-3 text-[15px] leading-[1.55] text-ink">
            <HoustonAvatar color="var(--ht-agent-purple)" diameter={32} />
            Meeting Notes
          </span>
          <span className="inline-flex items-center gap-3 text-[15px] leading-[1.55] text-ink">
            <HoustonAvatar
              color="var(--ht-agent-orange)"
              diameter={32}
              running
            />
            Inbox Zero
          </span>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="Sizes"
        note="`diameter` is a free pixel number — no preset scale. The helmet always sizes to ~65% of the disc; these are the three the app actually uses."
      >
        <SpecimenRow label="24px — list rows">
          <HoustonAvatar color="var(--ht-agent-crimson)" diameter={24} />
          <HoustonAvatar
            color="var(--ht-agent-crimson)"
            diameter={24}
            running
          />
        </SpecimenRow>
        <SpecimenRow label="40px — default, kanban cards">
          <HoustonAvatar color="var(--ht-agent-crimson)" />
          <HoustonAvatar color="var(--ht-agent-crimson)" running />
        </SpecimenRow>
        <SpecimenRow label="64px — detail panel header">
          <HoustonAvatar color="var(--ht-agent-crimson)" diameter={64} />
          <HoustonAvatar
            color="var(--ht-agent-crimson)"
            diameter={64}
            running
          />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenProps
        items={[
          {
            name: "color",
            type: "string",
            note: "CSS colour for helmet + disc tint. Pass a `var(--ht-agent-*)` reference so it tracks the theme. Defaults to `var(--ht-ink-muted)`.",
          },
          {
            name: "diameter",
            type: "number",
            note: "Outer circle in pixels. Defaults to 40.",
          },
          {
            name: "running",
            type: "boolean",
            note: "Wraps the disc in the `.avatar-running-ring` halo. Defaults to false.",
          },
          {
            name: "className",
            type: "string",
            note: "Merged onto the inner disc (not the halo wrapper).",
          },
          {
            name: "HoustonHelmet color",
            type: "string",
            note: "Fill of the bare glyph. Defaults to `var(--ht-ink-muted)`.",
          },
          {
            name: "HoustonHelmet size",
            type: "number",
            note: "Width and height in pixels. Defaults to 24.",
          },
        ]}
      />

      <SpecimenTokens
        classes={[
          "var(--ht-ink-muted)",
          "var(--ht-chip)",
          "var(--ht-agent-charcoal)",
          "var(--ht-agent-forest)",
          "var(--ht-agent-navy)",
          "var(--ht-agent-purple)",
          "var(--ht-agent-crimson)",
          "var(--ht-agent-orange)",
          "var(--ht-agent-golden)",
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
export const sources: string[] = ["HoustonAvatar", "HoustonHelmet"];

export const specimen: Specimen = {
  id: "core-houston-avatar",
  title: "HoustonAvatar",
  group: "Data display",
  render: () => <HoustonAvatarSpecimen />,
};
