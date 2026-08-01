import type { Specimen } from "../../src/specimen";
import { SpecimenPage, SpecimenSection } from "../../src/specimen";
import { ColorRow } from "./color-row";
import { COLOR_TOKEN_GROUPS, COLOR_TOKEN_NAMES } from "./color-tokens";
import { EffectsSection } from "./effects";
import { useTokenValues } from "./use-live-theme";

/**
 * The palette, end to end: every semantic `--ht-*` token with its swatch, the
 * plain-English name to say out loud, what it is for, the CSS variable to
 * type, and the value it resolves to in the theme currently on screen. Flip
 * the theme in the top bar and every value on the page re-reads itself.
 *
 * The landing page of the showcase, because colour is the first decision every
 * other decision here is made against.
 *
 * The token list is READ from `@houston/design-tokens`, so it cannot fall
 * behind the palette; only the words are curated (`color-vocabulary.ts`).
 */
function ColorsSpecimen() {
  const values = useTokenValues(COLOR_TOKEN_NAMES);
  return (
    <SpecimenPage
      title="Colors"
      intro={`The ${COLOR_TOKEN_NAMES.length} semantic tokens every Houston surface paints with. Values are read live from the document, so what you see is what the theme on screen actually resolves.`}
    >
      {COLOR_TOKEN_GROUPS.map((group) => (
        <SpecimenSection
          key={group.title}
          title={group.title}
          note={group.note}
        >
          {group.tokens.map((token) => (
            <ColorRow
              key={token.name}
              token={token}
              value={values[token.name]}
            />
          ))}
        </SpecimenSection>
      ))}

      <EffectsSection />
    </SpecimenPage>
  );
}

/**
 * Deliberately empty, and the ONE page allowed to be.
 *
 * `sources` names the `@houston-ai/*` components a page documents so
 * `scripts/gen-usage.mjs` can build its "Used in" row. This page documents the
 * design tokens themselves — every component uses all of them, which is the
 * same information as none. The generator and `tests/registry.test.tsx` both
 * carve out `foundations-*` for exactly this reason; every other page still
 * has to name its symbols.
 */
export const sources: string[] = [];

export const specimen: Specimen = {
  id: "foundations-colors",
  title: "Colors",
  group: "Foundations",
  render: () => <ColorsSpecimen />,
};
