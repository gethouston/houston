import { AgentAvatar } from "@houston-ai/core";
import type { Specimen } from "../../../src/specimen";
import {
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";
import { BROKEN_AVATAR_URL, SAMPLE_AGENT_AVATAR } from "./sample-avatar";

function AgentAvatarSpecimen() {
  return (
    <SpecimenPage
      title="AgentAvatar"
      intro="The image avatar for a named agent — Houston, Apollo, or anything published to the store."
    >
      <SpecimenSection
        title="Variants"
        note="No `variant` prop: it is an `<img>` with a circular mask. `size` is the only preset axis; everything else arrives through `src`."
      >
        <SpecimenRow label="Alone">
          <AgentAvatar src={SAMPLE_AGENT_AVATAR} alt="Inbox Zero" />
        </SpecimenRow>
        <SpecimenRow label="Beside an agent name">
          <span className="inline-flex items-center gap-2 text-[15px] leading-[1.55] text-ink">
            <AgentAvatar src={SAMPLE_AGENT_AVATAR} alt="" size="sm" />
            Inbox Zero
          </span>
          <span className="inline-flex items-center gap-2 text-[15px] leading-[1.55] text-ink">
            <AgentAvatar src={SAMPLE_AGENT_AVATAR} alt="" size="sm" />
            Meeting Notes
          </span>
        </SpecimenRow>
        <SpecimenRow label="On a store row">
          <div className="flex w-full max-w-sm items-center gap-3 rounded-2xl border border-line bg-card px-4 py-3">
            <AgentAvatar src={SAMPLE_AGENT_AVATAR} alt="" size="md" />
            <span className="flex min-w-0 flex-col">
              <span className="text-[15px] leading-[1.55] text-ink">
                Weekly Report
              </span>
              <span className="text-[13px] leading-[1.4] text-ink-muted">
                @julian · 2.7k installs
              </span>
            </span>
          </div>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="A plain image: no hover, disabled or loading treatment. It has no fallback either — a `src` that fails leaves the browser's broken-image behaviour, so use `Avatar` + `AvatarFallback` where the URL is user-supplied."
      >
        <SpecimenRow label="Decorative (alt defaults to empty)">
          <AgentAvatar src={SAMPLE_AGENT_AVATAR} />
          <span className="text-[13px] leading-[1.4] text-ink-muted">
            Correct when the agent's name is already visible beside it.
          </span>
        </SpecimenRow>
        <SpecimenRow label="Named (alt supplied)">
          <AgentAvatar src={SAMPLE_AGENT_AVATAR} alt="Inbox Zero" />
          <span className="text-[13px] leading-[1.4] text-ink-muted">
            Required when the avatar stands alone.
          </span>
        </SpecimenRow>
        <SpecimenRow label="Broken src (no fallback)">
          <AgentAvatar src={BROKEN_AVATAR_URL} alt="Inbox Zero" />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="Sizes"
        note="All three values of `size`. `md` is the default."
      >
        <SpecimenRow label="sm — 16px">
          <AgentAvatar src={SAMPLE_AGENT_AVATAR} alt="" size="sm" />
        </SpecimenRow>
        <SpecimenRow label="md — 28px (default)">
          <AgentAvatar src={SAMPLE_AGENT_AVATAR} alt="" size="md" />
        </SpecimenRow>
        <SpecimenRow label="lg — 48px">
          <AgentAvatar src={SAMPLE_AGENT_AVATAR} alt="" size="lg" />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenProps
        items={[
          {
            name: "src",
            type: "string",
            note: "Image URL. Required — the component renders a bare `<img>`.",
          },
          {
            name: "alt",
            type: "string",
            note: 'Defaults to "" (decorative). Pass the agent name when it stands alone.',
          },
          {
            name: "size",
            type: '"sm" | "md" | "lg"',
            note: 'size-4 / size-7 / size-12. Defaults to "md".',
          },
          {
            name: "className",
            type: "string",
            note: "Merged after the size class, so it wins.",
          },
        ]}
      />

      <SpecimenTokens classes={["rounded-full", "shrink-0"]} />
    </SpecimenPage>
  );
}

/**
 * The `@houston-ai/*` symbols this page documents. `scripts/gen-usage.mjs`
 * reads them to build the "Used in" map, so they are the exported names
 * exactly as a consumer imports them.
 */
export const sources: string[] = ["AgentAvatar"];

export const specimen: Specimen = {
  id: "core-agent-avatar",
  title: "AgentAvatar",
  group: "Data display",
  render: () => <AgentAvatarSpecimen />,
};
