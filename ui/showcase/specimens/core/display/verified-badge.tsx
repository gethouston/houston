import { VerifiedBadge } from "@houston-ai/core";
import type { Specimen } from "../../../src/specimen";
import {
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";

function VerifiedBadgeSpecimen() {
  return (
    <SpecimenPage
      title="VerifiedBadge"
      intro="The verified-creator glyph: a scalloped badge check, painted in the action colour."
    >
      <SpecimenSection
        title="Variants"
        note="No `variant` prop — the component has exactly one visual form. The only axes are `size` and the accessible `label`."
      >
        <SpecimenRow label="Alone">
          <VerifiedBadge />
        </SpecimenRow>
        <SpecimenRow label="After a creator handle">
          <span className="inline-flex items-center gap-1.5 text-[15px] leading-[1.55] text-ink">
            @julian
            <VerifiedBadge />
          </span>
          <span className="inline-flex items-center gap-1.5 text-[15px] leading-[1.55] text-ink">
            Houston Labs
            <VerifiedBadge />
          </span>
        </SpecimenRow>
        <SpecimenRow label="On a store row">
          <div className="flex w-full max-w-sm items-center justify-between gap-4 rounded-2xl border border-line bg-card px-4 py-3">
            <span className="text-[15px] leading-[1.55] text-ink">
              Inbox Zero
            </span>
            <span className="inline-flex items-center gap-1.5 text-[13px] leading-[1.4] text-ink-muted">
              @julian
              <VerifiedBadge size="sm" />
            </span>
          </div>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note={
          'Presentational and static: no hover, disabled or loading state. It renders `role="img"` with `label` as its accessible name, so the only real state is which language `label` arrives in.'
        }
      >
        <SpecimenRow label="Default label">
          <span className="inline-flex items-center gap-1.5 text-[15px] leading-[1.55] text-ink">
            @julian
            <VerifiedBadge />
          </span>
          <code className="text-[13px] leading-[1.4] text-ink-muted">
            aria-label="Verified"
          </code>
        </SpecimenRow>
        <SpecimenRow label="Translated label">
          <span className="inline-flex items-center gap-1.5 text-[15px] leading-[1.55] text-ink">
            @julian
            <VerifiedBadge label="Verificado" />
          </span>
          <code className="text-[13px] leading-[1.4] text-ink-muted">
            aria-label="Verificado"
          </code>
        </SpecimenRow>
        <SpecimenRow label="In muted text (colour is fixed)">
          <span className="inline-flex items-center gap-1.5 text-[13px] leading-[1.4] text-ink-muted">
            Published by @julian
            <VerifiedBadge size="sm" />
          </span>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="Sizes"
        note="Both values of `size`. `md` is the default."
      >
        <SpecimenRow label="sm — 14px">
          <VerifiedBadge size="sm" />
          <span className="inline-flex items-center gap-1.5 text-[13px] leading-[1.4] text-ink-muted">
            @julian
            <VerifiedBadge size="sm" />
          </span>
        </SpecimenRow>
        <SpecimenRow label="md — 16px (default)">
          <VerifiedBadge size="md" />
          <span className="inline-flex items-center gap-1.5 text-[15px] leading-[1.55] text-ink">
            @julian
            <VerifiedBadge size="md" />
          </span>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenProps
        items={[
          {
            name: "size",
            type: '"sm" | "md"',
            note: 'Defaults to "md" (`size-4`); "sm" is `size-3.5`.',
          },
          {
            name: "label",
            type: "string",
            note: 'Accessible name, already translated. Defaults to "Verified".',
          },
          {
            name: "className",
            type: "string",
            note: "Merged last — the only way to change its size beyond the two presets.",
          },
        ]}
      />

      <SpecimenTokens classes={["text-action"]} />
    </SpecimenPage>
  );
}

/**
 * The `@houston-ai/*` symbols this page documents. `scripts/gen-usage.mjs`
 * reads them to build the "Used in" map, so they are the exported names
 * exactly as a consumer imports them.
 */
export const sources: string[] = ["VerifiedBadge"];

export const specimen: Specimen = {
  id: "core-verified-badge",
  title: "VerifiedBadge",
  group: "Data display",
  render: () => <VerifiedBadgeSpecimen />,
};
